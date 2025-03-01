/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { memo, useMemo } from 'react';
import { EuiFlexGroup, EuiFlexItem, EuiText, EuiLoadingContent, EuiToolTip } from '@elastic/eui';
import { FormattedMessage, FormattedRelative } from '@kbn/i18n-react';
import { useGetEndpointDetails } from '../../hooks/endpoint/use_get_endpoint_details';
import { useGetEndpointPendingActionsSummary } from '../../hooks/endpoint/use_get_endpoint_pending_actions_summary';
import { EndpointHostIsolationStatusProps } from '../../../common/components/endpoint/host_isolation';
import { EndpointAgentAndIsolationStatus } from '../endpoint_agent_and_isolation_status';

interface HeaderEndpointInfoProps {
  endpointId: string;
}

export const HeaderEndpointInfo = memo<HeaderEndpointInfoProps>(({ endpointId }) => {
  const { data: endpointDetails, isFetching } = useGetEndpointDetails(endpointId, {
    refetchInterval: 10000,
  });
  const { data: endpointPendingActions } = useGetEndpointPendingActionsSummary([endpointId], {
    refetchInterval: 10000,
  });

  const pendingIsolationActions = useMemo<
    Pick<Required<EndpointHostIsolationStatusProps>, 'pendingIsolate' | 'pendingUnIsolate'>
  >(() => {
    if (endpointPendingActions?.data.length) {
      const pendingActions = endpointPendingActions.data[0].pending_actions;

      return {
        pendingIsolate: pendingActions.isolate ?? 0,
        pendingUnIsolate: pendingActions.unisolate ?? 0,
      };
    }
    return {
      pendingIsolate: 0,
      pendingUnIsolate: 0,
    };
  }, [endpointPendingActions?.data]);

  if (isFetching && endpointPendingActions === undefined) {
    return <EuiLoadingContent lines={2} />;
  }

  if (!endpointDetails) {
    return null;
  }

  return (
    <EuiFlexGroup direction="column" gutterSize="none">
      <EuiFlexItem grow={false}>
        <EuiFlexGroup alignItems="center" gutterSize="xs">
          <EuiFlexItem grow={false} className="eui-textTruncate">
            <EuiToolTip
              content={endpointDetails.metadata.host.name}
              anchorClassName="eui-textTruncate"
            >
              <EuiText size="s" data-test-subj="responderHeaderEndpointName">
                <h6 className="eui-textTruncate">
                  <FormattedMessage
                    id="xpack.securitySolution.responder.header.endpointName"
                    defaultMessage="ENDPOINT {name}"
                    values={{ name: endpointDetails.metadata.host.name }}
                  />
                </h6>
              </EuiText>
            </EuiToolTip>
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <EndpointAgentAndIsolationStatus
              status={endpointDetails.host_status}
              isIsolated={endpointDetails.metadata.Endpoint.state?.isolation}
              {...pendingIsolationActions}
              data-test-subj="responderHeaderEndpointAgentIsolationStatus"
            />
          </EuiFlexItem>
        </EuiFlexGroup>
      </EuiFlexItem>
      <EuiFlexItem grow={false}>
        <EuiText color="subdued" size="s" data-test-subj="responderHeaderLastSeen">
          <FormattedMessage
            id="xpack.securitySolution.responder.header.lastSeen"
            defaultMessage="Last seen {date}"
            values={{
              date: <FormattedRelative value={endpointDetails.metadata['@timestamp']} />,
            }}
          />
        </EuiText>
      </EuiFlexItem>
    </EuiFlexGroup>
  );
});

HeaderEndpointInfo.displayName = 'HeaderEndpointInfo';
