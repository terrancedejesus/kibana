/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { EuiBadge, EuiText } from '@elastic/eui';
import React from 'react';
import styled from 'styled-components';

import { BrowserFields } from '../../../../common/containers/source';
import { AndOrBadge } from '../../../../common/components/and_or_badge';
import { AddDataProviderPopover } from './add_data_provider_popover';

import * as i18n from './translations';

export const HIGHLIGHTED_DROP_TARGET_CLASS_NAME = 'highlighted-drop-target';

const Text = styled(EuiText)`
  overflow: hidden;
  margin: 5px 0 5px 0;
  padding: 3px;
  white-space: nowrap;
`;

Text.displayName = 'Text';

const BadgeHighlighted = styled(EuiBadge)`
  height: 20px;
  margin: 0 5px 0 5px;
  maxwidth: 85px;
  minwidth: 85px;
` as unknown as typeof EuiBadge;

BadgeHighlighted.displayName = 'BadgeHighlighted';

const HighlightedBackground = styled.span`
  background-color: ${(props) => props.theme.eui.euiColorLightShade};
`;

HighlightedBackground.displayName = 'HighlightedBackground';

const EmptyContainer = styled.div<{ showSmallMsg: boolean }>`
  width: ${(props) => (props.showSmallMsg ? '60px' : 'auto')};
  align-items: center;
  display: flex;
  flex-direction: column;
  flex-wrap: wrap;
  justify-content: center;
  user-select: none;
  align-content: center;
  ${(props) =>
    props.showSmallMsg
      ? `
      border-right: 1px solid ${props.theme.eui.euiColorMediumShade};
      margin-right: 10px;
    `
      : `
  min-height: 100px;
  + div {
    display: none !important;
   }
  `}
`;

EmptyContainer.displayName = 'EmptyContainer';

const NoWrap = styled.div`
  align-items: center;
  display: flex;
  flex-direction: row;
  flex-wrap: no-wrap;
`;

NoWrap.displayName = 'NoWrap';
interface Props {
  browserFields: BrowserFields;
  showSmallMsg?: boolean;
  timelineId: string;
}
/**
 * Prompts the user to drop anything with a facet count into the data providers section.
 */
export const Empty = React.memo<Props>(({ showSmallMsg = false, browserFields, timelineId }) => (
  <EmptyContainer
    className="timeline-drop-area-empty"
    data-test-subj="empty"
    showSmallMsg={showSmallMsg}
  >
    {!showSmallMsg && (
      <>
        <NoWrap>
          <Text color="subdued" size="s" className="timeline-drop-area-empty__text">
            {i18n.DROP_ANYTHING}
          </Text>
          <HighlightedBackground>
            <BadgeHighlighted className={HIGHLIGHTED_DROP_TARGET_CLASS_NAME}>
              {i18n.HIGHLIGHTED}
            </BadgeHighlighted>
          </HighlightedBackground>
          <Text color="subdued" size="s" className="timeline-drop-area-empty__text">
            {i18n.HERE_TO_BUILD_AN}
          </Text>
          <AndOrBadge type="or" />
          <Text color="subdued" size="s" className="timeline-drop-area-empty__text">
            {i18n.QUERY}
          </Text>
        </NoWrap>

        <AddDataProviderPopover browserFields={browserFields} timelineId={timelineId} />
      </>
    )}
    {showSmallMsg && <AndOrBadge type="or" />}
  </EmptyContainer>
));

Empty.displayName = 'Empty';
