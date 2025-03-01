/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { memo, PropsWithChildren, ReactNode, useMemo } from 'react';
import {
  EuiFlexGroup,
  EuiFlexItem,
  EuiPageHeader,
  EuiPanel,
  EuiPanelProps,
  EuiSpacer,
  EuiTitle,
} from '@elastic/eui';
import styled from 'styled-components';
import classnames from 'classnames';
import { EuiPageHeaderProps } from '@elastic/eui/src/components/page/page_header/page_header';
import { useTestIdGenerator } from '../../../../../hooks/use_test_id_generator';

const EuiPanelStyled = styled(EuiPanel)`
  &.full-height,
  .full-height {
    height: 100%;
  }

  .is-not-scrollable {
    overflow: hidden;
  }

  .is-scrollable {
    overflow: auto;
  }
`;

export type PageLayoutProps = PropsWithChildren<{
  pageTitle?: ReactNode;
  pageDescription?: ReactNode;
  actions?: ReactNode | ReactNode[];
  headerHasBottomBorder?: boolean;
  restrictWidth?: boolean | number | string;
  paddingSize?: EuiPanelProps['paddingSize'];
  scrollableBody?: boolean;
  headerBackComponent?: ReactNode;
  'data-test-subj'?: string;
}>;

export const PageLayout = memo<PageLayoutProps>(
  ({
    pageTitle,
    pageDescription,
    actions,
    headerHasBottomBorder,
    restrictWidth,
    paddingSize = 'l',
    scrollableBody = false,
    headerBackComponent,
    children,
    'data-test-subj': dataTestSubj,
  }) => {
    const hideHeader = !pageTitle && !pageDescription && !actions && !headerBackComponent;

    const getTestId = useTestIdGenerator(dataTestSubj);

    const headerRightSideItems = useMemo(() => {
      return Array.isArray(actions) ? actions : actions ? [actions] : undefined;
    }, [actions]);

    const headerRightSideGroupProps = useMemo<EuiPageHeaderProps['rightSideGroupProps']>(() => {
      return {
        gutterSize: 'm',
      };
    }, []);

    const bodyClassName = useMemo(() => {
      return classnames({
        'is-scrollable': scrollableBody,
        'is-not-scrollable': !scrollableBody,
        'full-height': true,
      });
    }, [scrollableBody]);

    const headerTitleContainer = useMemo(() => {
      return hideHeader ? null : (
        <EuiFlexGroup
          direction="column"
          gutterSize="none"
          alignItems="flexStart"
          wrap={false}
          responsive={false}
        >
          {headerBackComponent && <EuiFlexItem grow={false}>{headerBackComponent}</EuiFlexItem>}
          <EuiFlexItem grow={false}>
            <EuiTitle size="l">
              <span data-test-subj={getTestId('titleHolder')}>{pageTitle}</span>
            </EuiTitle>
          </EuiFlexItem>
        </EuiFlexGroup>
      );
    }, [getTestId, headerBackComponent, hideHeader, pageTitle]);

    return (
      <EuiPanelStyled
        hasShadow={false}
        paddingSize={paddingSize}
        data-test-subj={dataTestSubj}
        className="full-height"
        color="transparent"
      >
        <EuiFlexGroup
          direction="column"
          responsive={false}
          gutterSize="none"
          className="full-height"
          data-test-subj={getTestId('root')}
        >
          {!hideHeader && (
            <EuiFlexItem grow={false} data-test-subj={getTestId('headerContainer')}>
              <EuiPageHeader
                pageTitle={headerTitleContainer}
                description={pageDescription}
                bottomBorder={headerHasBottomBorder}
                rightSideItems={headerRightSideItems}
                rightSideGroupProps={headerRightSideGroupProps}
                restrictWidth={restrictWidth}
                data-test-subj={getTestId('header')}
              />
              <EuiSpacer size="l" />
            </EuiFlexItem>
          )}

          <EuiFlexItem grow className={bodyClassName} data-test-subj={getTestId('body')}>
            <div role="main" className="full-height">
              {children}
            </div>
          </EuiFlexItem>
        </EuiFlexGroup>
      </EuiPanelStyled>
    );
  }
);
PageLayout.displayName = 'PageLayout';
