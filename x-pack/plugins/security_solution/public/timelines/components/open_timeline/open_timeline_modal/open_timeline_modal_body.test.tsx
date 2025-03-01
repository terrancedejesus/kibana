/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { cloneDeep } from 'lodash/fp';
import { mountWithIntl } from '@kbn/test-jest-helpers';
import React from 'react';
import { ThemeProvider } from 'styled-components';

import '../../../../common/mock/match_media';
import { DEFAULT_SEARCH_RESULTS_PER_PAGE } from '../../../pages/timelines_page';
import { OpenTimelineResult, OpenTimelineProps } from '../types';
import { TimelinesTableProps } from '../timelines_table';
import { mockTimelineResults } from '../../../../common/mock/timeline_results';
import { OpenTimelineModalBody } from './open_timeline_modal_body';
import { DEFAULT_SORT_DIRECTION, DEFAULT_SORT_FIELD } from '../constants';
import { TimelineType, TimelineStatus } from '../../../../../common/types/timeline';
import { getMockTheme } from '../../../../common/lib/kibana/kibana_react.mock';

jest.mock('../../../../common/lib/kibana');

describe('OpenTimelineModal', () => {
  const mockTheme = getMockTheme({
    eui: {
      euiColorMediumShade: '#ece',
      euiBreakpoints: {
        s: '500px',
      },
      euiSizeM: '16px',
    },
  });
  const title = 'All Timelines / Open Timelines';
  let mockResults: OpenTimelineResult[];

  const getDefaultTestProps = (mockSearchResults: OpenTimelineResult[]): OpenTimelineProps => ({
    deleteTimelines: jest.fn(),
    defaultPageSize: DEFAULT_SEARCH_RESULTS_PER_PAGE,
    isLoading: false,
    itemIdToExpandedNotesRowMap: {},
    onAddTimelinesToFavorites: jest.fn(),
    onDeleteSelected: jest.fn(),
    onlyFavorites: false,
    onOpenTimeline: jest.fn(),
    onQueryChange: jest.fn(),
    onSelectionChange: jest.fn(),
    onTableChange: jest.fn(),
    onToggleOnlyFavorites: jest.fn(),
    onToggleShowNotes: jest.fn(),
    pageIndex: 0,
    pageSize: DEFAULT_SEARCH_RESULTS_PER_PAGE,
    query: '',
    searchResults: mockSearchResults,
    selectedItems: [],
    sortDirection: DEFAULT_SORT_DIRECTION,
    sortField: DEFAULT_SORT_FIELD,
    timelineType: TimelineType.default,
    timelineStatus: TimelineStatus.active,
    templateTimelineFilter: [<div key={0} />],
    title,
    totalSearchResultsCount: mockSearchResults.length,
  });

  beforeEach(() => {
    mockResults = cloneDeep(mockTimelineResults);
  });

  test('it renders the title row', () => {
    const defaultProps = getDefaultTestProps(mockResults);
    const wrapper = mountWithIntl(
      <ThemeProvider theme={mockTheme}>
        <OpenTimelineModalBody {...defaultProps} />
      </ThemeProvider>
    );

    expect(wrapper.find('[data-test-subj="title-row"]').first().exists()).toBe(true);
  });

  test('it renders the search row', () => {
    const defaultProps = getDefaultTestProps(mockResults);
    const wrapper = mountWithIntl(
      <ThemeProvider theme={mockTheme}>
        <OpenTimelineModalBody {...defaultProps} />
      </ThemeProvider>
    );

    expect(wrapper.find('[data-test-subj="search-row"]').first().exists()).toBe(true);
  });

  test('it renders the timelines table', () => {
    const defaultProps = getDefaultTestProps(mockResults);
    const wrapper = mountWithIntl(
      <ThemeProvider theme={mockTheme}>
        <OpenTimelineModalBody {...defaultProps} />
      </ThemeProvider>
    );

    expect(wrapper.find('[data-test-subj="timelines-table"]').first().exists()).toBe(true);
  });

  test('it shows the delete action when onDeleteSelected and deleteTimelines are specified', () => {
    const defaultProps = {
      ...getDefaultTestProps(mockResults),
      onDeleteSelected: jest.fn(),
      deleteTimelines: jest.fn(),
    };
    const wrapper = mountWithIntl(
      <ThemeProvider theme={mockTheme}>
        <OpenTimelineModalBody {...defaultProps} />
      </ThemeProvider>
    );

    const props = wrapper
      .find('[data-test-subj="timelines-table"]')
      .first()
      .props() as TimelinesTableProps;

    expect(props.actionTimelineToShow).toContain('delete');
  });

  test('it does NOT show the delete when is onDeleteSelected undefined and deleteTimelines is specified', () => {
    const defaultProps = {
      ...getDefaultTestProps(mockResults),
      onDeleteSelected: undefined,
      deleteTimelines: undefined,
    };
    const wrapper = mountWithIntl(
      <ThemeProvider theme={mockTheme}>
        <OpenTimelineModalBody {...defaultProps} />
      </ThemeProvider>
    );

    const props = wrapper
      .find('[data-test-subj="timelines-table"]')
      .first()
      .props() as TimelinesTableProps;

    expect(props.actionTimelineToShow).not.toContain('delete');
  });

  test('it does NOT show the delete action when is onDeleteSelected provided and deleteTimelines is undefined', () => {
    const defaultProps = {
      ...getDefaultTestProps(mockResults),
      onDeleteSelected: undefined,
      deleteTimelines: undefined,
    };
    const wrapper = mountWithIntl(
      <ThemeProvider theme={mockTheme}>
        <OpenTimelineModalBody {...defaultProps} />
      </ThemeProvider>
    );

    const props = wrapper
      .find('[data-test-subj="timelines-table"]')
      .first()
      .props() as TimelinesTableProps;

    expect(props.actionTimelineToShow).not.toContain('delete');
  });

  test('it does NOT show extended columns when both onDeleteSelected and deleteTimelines are undefined', () => {
    const defaultProps = {
      ...getDefaultTestProps(mockResults),
      onDeleteSelected: undefined,
      deleteTimelines: undefined,
    };
    const wrapper = mountWithIntl(
      <ThemeProvider theme={mockTheme}>
        <OpenTimelineModalBody {...defaultProps} />
      </ThemeProvider>
    );

    const props = wrapper
      .find('[data-test-subj="timelines-table"]')
      .first()
      .props() as TimelinesTableProps;

    expect(props.actionTimelineToShow).not.toContain('delete');
  });
});
