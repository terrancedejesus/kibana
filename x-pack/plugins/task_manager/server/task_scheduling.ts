/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { filter, take } from 'rxjs/operators';
import pMap from 'p-map';
import { pipe } from 'fp-ts/lib/pipeable';
import { getOrElse, isSome, map as mapOptional, Option } from 'fp-ts/lib/Option';

import uuid from 'uuid';
import { chunk, pick } from 'lodash';
import { merge, Subject } from 'rxjs';
import agent from 'elastic-apm-node';
import { Logger } from '@kbn/core/server';
import { mustBeAllOf } from './queries/query_clauses';
import { asOk, either, isErr, map, mapErr, promiseResult } from './lib/result_type';
import {
  ClaimTaskErr,
  ErroredTask,
  ErrResultOf,
  isTaskClaimEvent,
  isTaskRunEvent,
  isTaskRunRequestEvent,
  OkResultOf,
  RanTask,
  TaskClaimErrorType,
} from './task_events';
import { Middleware } from './lib/middleware';
import { parseIntervalAsMillisecond } from './lib/intervals';
import {
  ConcreteTaskInstance,
  EphemeralTask,
  IntervalSchedule,
  TaskInstanceWithDeprecatedFields,
  TaskInstanceWithId,
  TaskLifecycle,
  TaskLifecycleResult,
  TaskStatus,
} from './task';
import { TaskStore } from './task_store';
import { ensureDeprecatedFieldsAreCorrected } from './lib/correct_deprecated_fields';
import { TaskLifecycleEvent, TaskPollingLifecycle } from './polling_lifecycle';
import { TaskTypeDictionary } from './task_type_dictionary';
import { EphemeralTaskLifecycle } from './ephemeral_task_lifecycle';
import { EphemeralTaskRejectedDueToCapacityError } from './task_running';

const VERSION_CONFLICT_STATUS = 409;

export interface TaskSchedulingOpts {
  logger: Logger;
  taskStore: TaskStore;
  taskPollingLifecycle: TaskPollingLifecycle;
  ephemeralTaskLifecycle: EphemeralTaskLifecycle;
  middleware: Middleware;
  definitions: TaskTypeDictionary;
  taskManagerId: string;
}

/**
 * return type of TaskScheduling.bulkUpdateSchedules method
 */
export interface BulkUpdateSchedulesResult {
  /**
   * list of successfully updated tasks
   */
  tasks: ConcreteTaskInstance[];

  /**
   * list of failed tasks and errors caused failure
   */
  errors: Array<{ task: ConcreteTaskInstance; error: Error }>;
}
export interface RunSoonResult {
  id: ConcreteTaskInstance['id'];
}

export interface RunNowResult {
  id: ConcreteTaskInstance['id'];
  state?: ConcreteTaskInstance['state'];
}

export class TaskScheduling {
  private store: TaskStore;
  private taskPollingLifecycle: TaskPollingLifecycle;
  private ephemeralTaskLifecycle: EphemeralTaskLifecycle;
  private logger: Logger;
  private middleware: Middleware;
  private definitions: TaskTypeDictionary;
  private taskManagerId: string;

  /**
   * Initializes the task manager, preventing any further addition of middleware,
   * enabling the task manipulation methods, and beginning the background polling
   * mechanism.
   */
  constructor(opts: TaskSchedulingOpts) {
    this.logger = opts.logger;
    this.middleware = opts.middleware;
    this.taskPollingLifecycle = opts.taskPollingLifecycle;
    this.ephemeralTaskLifecycle = opts.ephemeralTaskLifecycle;
    this.store = opts.taskStore;
    this.definitions = opts.definitions;
    this.taskManagerId = opts.taskManagerId;
  }

  /**
   * Schedules a task.
   *
   * @param task - The task being scheduled.
   * @returns {Promise<ConcreteTaskInstance>}
   */
  public async schedule(
    taskInstance: TaskInstanceWithDeprecatedFields,
    options?: Record<string, unknown>
  ): Promise<ConcreteTaskInstance> {
    const { taskInstance: modifiedTask } = await this.middleware.beforeSave({
      ...options,
      taskInstance: ensureDeprecatedFieldsAreCorrected(taskInstance, this.logger),
    });

    const traceparent =
      agent.currentTransaction && agent.currentTransaction.type !== 'request'
        ? agent.currentTraceparent
        : '';

    return await this.store.schedule({
      ...modifiedTask,
      traceparent: traceparent || '',
    });
  }

  /**
   * Bulk updates schedules for tasks by ids.
   * Only tasks with `idle` status will be updated, as for the tasks which have `running` status,
   * `schedule` and `runAt` will be recalculated after task run finishes
   *
   * @param {string[]} taskIds  - list of task ids
   * @param {IntervalSchedule} schedule  - new schedule
   * @returns {Promise<BulkUpdateSchedulesResult>}
   */
  public async bulkUpdateSchedules(
    taskIds: string[],
    schedule: IntervalSchedule
  ): Promise<BulkUpdateSchedulesResult> {
    const tasks = await pMap(
      chunk(taskIds, 100),
      async (taskIdsChunk) =>
        this.store.fetch({
          query: mustBeAllOf(
            {
              terms: {
                _id: taskIdsChunk.map((taskId) => `task:${taskId}`),
              },
            },
            {
              term: {
                'task.status': 'idle',
              },
            }
          ),
          size: 100,
        }),
      { concurrency: 10 }
    );

    const updatedTasks = tasks
      .flatMap(({ docs }) => docs)
      .reduce<ConcreteTaskInstance[]>((acc, task) => {
        // if task schedule interval is the same, no need to update it
        if (task.schedule?.interval === schedule.interval) {
          return acc;
        }

        const oldIntervalInMs = parseIntervalAsMillisecond(task.schedule?.interval ?? '0s');

        // computing new runAt using formula:
        // newRunAt = oldRunAt - oldInterval + newInterval
        const newRunAtInMs = Math.max(
          Date.now(),
          task.runAt.getTime() - oldIntervalInMs + parseIntervalAsMillisecond(schedule.interval)
        );

        acc.push({ ...task, schedule, runAt: new Date(newRunAtInMs) });
        return acc;
      }, []);

    return (await this.store.bulkUpdate(updatedTasks)).reduce<BulkUpdateSchedulesResult>(
      (acc, task) => {
        if (task.tag === 'ok') {
          acc.tasks.push(task.value);
        } else {
          acc.errors.push({ error: task.error.error, task: task.error.entity });
        }

        return acc;
      },
      { tasks: [], errors: [] }
    );
  }

  /**
   * Run  task.
   *
   * @param taskId - The task being scheduled.
   * @returns {Promise<RunSoonResult>}
   */
  public async runSoon(taskId: string): Promise<RunSoonResult> {
    const task = await this.getNonRunningTask(taskId);
    try {
      await this.store.update({
        ...task,
        status: TaskStatus.Idle,
        scheduledAt: new Date(),
        runAt: new Date(),
      });
    } catch (e) {
      if (e.statusCode === 409) {
        this.logger.debug(
          `Failed to update the task (${taskId}) for runSoon due to conflict (409)`
        );
      } else {
        this.logger.error(`Failed to update the task (${taskId}) for runSoon`);
        throw e;
      }
    }
    return { id: task.id };
  }

  /**
   * Run an ad-hoc task in memory without persisting it into ES or distributing the load across the cluster.
   *
   * @param task - The ephemeral task being queued.
   * @returns {Promise<ConcreteTaskInstance>}
   */
  public async ephemeralRunNow(
    task: EphemeralTask,
    options?: Record<string, unknown>
  ): Promise<RunNowResult> {
    const id = uuid.v4();
    const { taskInstance: modifiedTask } = await this.middleware.beforeSave({
      ...options,
      taskInstance: task,
    });
    return new Promise(async (resolve, reject) => {
      try {
        // The actual promise returned from this function is resolved after the awaitTaskRunResult promise resolves.
        // However, we do not wait to await this promise, as we want later execution to happen in parallel.
        // The awaitTaskRunResult promise is resolved once the ephemeral task is successfully executed (technically, when a TaskEventType.TASK_RUN is emitted with the same id).
        // However, the ephemeral task won't even get into the queue until the subsequent this.ephemeralTaskLifecycle.attemptToRun is called (which puts it in the queue).
        // The reason for all this confusion? Timing.
        // In the this.ephemeralTaskLifecycle.attemptToRun, it's possible that the ephemeral task is put into the queue and processed before this function call returns anything.
        // If that happens, putting the awaitTaskRunResult after would just hang because the task already completed. We need to listen for the completion before we add it to the queue to avoid this possibility.
        const { cancel, resolveOnCancel } = cancellablePromise();
        this.awaitTaskRunResult(id, resolveOnCancel)
          .then((arg: RunNowResult) => {
            resolve(arg);
          })
          .catch((err: Error) => {
            reject(err);
          });
        const attemptToRunResult = this.ephemeralTaskLifecycle.attemptToRun({
          id,
          scheduledAt: new Date(),
          runAt: new Date(),
          status: TaskStatus.Idle,
          ownerId: this.taskManagerId,
          ...modifiedTask,
        });

        if (isErr(attemptToRunResult)) {
          cancel();
          reject(
            new EphemeralTaskRejectedDueToCapacityError(
              `Ephemeral Task of type ${task.taskType} was rejected`,
              task
            )
          );
        }
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Schedules a task with an Id
   *
   * @param task - The task being scheduled.
   * @returns {Promise<TaskInstanceWithId>}
   */
  public async ensureScheduled(
    taskInstance: TaskInstanceWithId,
    options?: Record<string, unknown>
  ): Promise<TaskInstanceWithId> {
    try {
      return await this.schedule(taskInstance, options);
    } catch (err) {
      if (err.statusCode === VERSION_CONFLICT_STATUS) {
        return taskInstance;
      }
      throw err;
    }
  }

  private awaitTaskRunResult(taskId: string, cancel?: Promise<void>): Promise<RunNowResult> {
    return new Promise((resolve, reject) => {
      // listen for all events related to the current task
      const subscription = merge(
        this.taskPollingLifecycle.events,
        this.ephemeralTaskLifecycle.events
      )
        .pipe(filter(({ id }: TaskLifecycleEvent) => id === taskId))
        .subscribe((taskEvent: TaskLifecycleEvent) => {
          if (isTaskClaimEvent(taskEvent)) {
            mapErr(async (error: ClaimTaskErr) => {
              // reject if any error event takes place for the requested task
              subscription.unsubscribe();
              if (
                isSome(error.task) &&
                error.errorType === TaskClaimErrorType.CLAIMED_BY_ID_OUT_OF_CAPACITY
              ) {
                const task = error.task.value;
                const definition = this.definitions.get(task.taskType);
                return reject(
                  new Error(
                    `Failed to run task "${taskId}" as we would exceed the max concurrency of "${
                      definition?.title ?? task.taskType
                    }" which is ${
                      definition?.maxConcurrency
                    }. Rescheduled the task to ensure it is picked up as soon as possible.`
                  )
                );
              } else {
                return reject(await this.identifyTaskFailureReason(taskId, error.task));
              }
            }, taskEvent.event);
          } else {
            either<OkResultOf<TaskLifecycleEvent>, ErrResultOf<TaskLifecycleEvent>>(
              taskEvent.event,
              (taskInstance: OkResultOf<TaskLifecycleEvent>) => {
                // resolve if the task has run sucessfully
                if (isTaskRunEvent(taskEvent)) {
                  subscription.unsubscribe();
                  resolve(pick((taskInstance as RanTask).task, ['id', 'state']));
                }
              },
              async (errorResult: ErrResultOf<TaskLifecycleEvent>) => {
                // reject if any error event takes place for the requested task
                subscription.unsubscribe();
                return reject(
                  new Error(
                    `Failed to run task "${taskId}": ${
                      isTaskRunRequestEvent(taskEvent)
                        ? `Task Manager is at capacity, please try again later`
                        : isTaskRunEvent(taskEvent)
                        ? `${(errorResult as ErroredTask).error}`
                        : `${errorResult}`
                    }`
                  )
                );
              }
            );
          }
        });

      if (cancel) {
        cancel.then(() => {
          subscription.unsubscribe();
        });
      }
    });
  }

  private async identifyTaskFailureReason(taskId: string, error: Option<ConcreteTaskInstance>) {
    return map(
      await pipe(
        error,
        mapOptional(async (taskReturnedBySweep) => asOk(taskReturnedBySweep.status)),
        getOrElse(() =>
          // if the error happened in the Claim phase - we try to provide better insight
          // into why we failed to claim by getting the task's current lifecycle status
          promiseResult<TaskLifecycle, Error>(this.store.getLifecycle(taskId))
        )
      ),
      (taskLifecycleStatus: TaskLifecycle) => {
        if (taskLifecycleStatus === TaskLifecycleResult.NotFound) {
          return new Error(`Failed to run task "${taskId}" as it does not exist`);
        } else if (
          taskLifecycleStatus === TaskStatus.Running ||
          taskLifecycleStatus === TaskStatus.Claiming
        ) {
          return new Error(`Failed to run task "${taskId}" as it is currently running`);
        }
        return new Error(
          `Failed to run task "${taskId}" for unknown reason (Current Task Lifecycle is "${taskLifecycleStatus}")`
        );
      },
      (getLifecycleError: Error) =>
        new Error(
          `Failed to run task "${taskId}" and failed to get current Status:${getLifecycleError}`
        )
    );
  }

  private async getNonRunningTask(taskId: string) {
    const task = await this.store.get(taskId);
    switch (task.status) {
      case TaskStatus.Claiming:
      case TaskStatus.Running:
        throw Error(`Failed to run task "${taskId}" as it is currently running`);
      case TaskStatus.Unrecognized:
        throw Error(`Failed to run task "${taskId}" with status ${task.status}`);
      case TaskStatus.Failed:
      default:
        return task;
    }
  }
}

const cancellablePromise = () => {
  const boolStream = new Subject<boolean>();
  return {
    cancel: () => boolStream.next(true),
    resolveOnCancel: boolStream
      .pipe(take(1))
      .toPromise()
      .then(() => {}),
  };
};
