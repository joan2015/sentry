import React from 'react';
import {Params} from 'react-router/lib/Router';
import {Location} from 'history';

import AsyncComponent from 'app/components/asyncComponent';
import Button from 'app/components/button';
import ButtonBar from 'app/components/buttonBar';
import NotFound from 'app/components/errors/notFound';
import {BorderlessEventEntries} from 'app/components/events/eventEntries';
import EventMetadata from 'app/components/events/eventMetadata';
import EventVitals from 'app/components/events/eventVitals';
import * as SpanEntryContext from 'app/components/events/interfaces/spans/context';
import OpsBreakdown from 'app/components/events/opsBreakdown';
import RootSpanStatus from 'app/components/events/rootSpanStatus';
import FileSize from 'app/components/fileSize';
import * as Layout from 'app/components/layouts/thirds';
import LoadingError from 'app/components/loadingError';
import SentryDocumentTitle from 'app/components/sentryDocumentTitle';
import TagsTable from 'app/components/tagsTable';
import {IconOpen} from 'app/icons';
import {t} from 'app/locale';
import {Organization, Project} from 'app/types';
import {Event, EventTag} from 'app/types/event';
import {trackAnalyticsEvent} from 'app/utils/analytics';
import Projects from 'app/utils/projects';
import {appendTagCondition, decodeScalar} from 'app/utils/queryString';
import Breadcrumb from 'app/views/performance/breadcrumb';

import {transactionSummaryRouteWithQuery} from '../transactionSummary/utils';
import {getTransactionDetailsUrl} from '../utils';

import EventMetas from './eventMetas';

type Props = {
  organization: Organization;
  location: Location;
  params: Params;
  eventSlug: string;
};

type State = {
  event: Event | undefined;
  isSidebarVisible: boolean;
} & AsyncComponent['state'];

class EventDetailsContent extends AsyncComponent<Props, State> {
  state: State = {
    // AsyncComponent state
    loading: true,
    reloading: false,
    error: false,
    errors: [],
    event: undefined,

    // local state
    isSidebarVisible: true,
  };

  toggleSidebar = () => {
    this.setState({isSidebarVisible: !this.state.isSidebarVisible});
  };

  getEndpoints(): ReturnType<AsyncComponent['getEndpoints']> {
    const {organization, params} = this.props;
    const {eventSlug} = params;

    const url = `/organizations/${organization.slug}/events/${eventSlug}/`;

    return [['event', url]];
  }

  get projectId() {
    return this.props.eventSlug.split(':')[0];
  }

  generateTagUrl = (tag: EventTag) => {
    const {location, organization} = this.props;
    const {event} = this.state;
    if (!event) {
      return '';
    }
    const query = decodeScalar(location.query.query, '');
    const newQuery = {
      ...location.query,
      query: appendTagCondition(query, tag.key, tag.value),
    };
    return transactionSummaryRouteWithQuery({
      orgSlug: organization.slug,
      transaction: event.title,
      projectID: decodeScalar(location.query.project),
      query: newQuery,
    });
  };

  renderBody() {
    const {event} = this.state;

    if (!event) {
      return <NotFound />;
    }

    return this.renderContent(event);
  }

  renderContent(event: Event) {
    const {organization, location, eventSlug} = this.props;

    // metrics
    trackAnalyticsEvent({
      eventKey: 'performance.event_details',
      eventName: 'Performance: Opened Event Details',
      event_type: event.type,
      organization_id: parseInt(organization.id, 10),
    });

    const {isSidebarVisible} = this.state;
    const transactionName = event.title;
    const query = decodeScalar(location.query.query, '');

    const hasQuickTraceView =
      organization.features.includes('trace-view-quick') &&
      organization.features.includes('trace-view-summary');

    const eventJsonUrl = `/api/0/projects/${organization.slug}/${this.projectId}/events/${event.eventID}/json/`;

    return (
      <React.Fragment>
        <Layout.Header>
          <Layout.HeaderContent>
            <Breadcrumb
              organization={organization}
              location={location}
              transactionName={transactionName}
              eventSlug={eventSlug}
            />
            <Layout.Title data-test-id="event-header">{event.title}</Layout.Title>
          </Layout.HeaderContent>
          <Layout.HeaderActions>
            <ButtonBar gap={1}>
              <Button onClick={this.toggleSidebar}>
                {isSidebarVisible ? 'Hide Details' : 'Show Details'}
              </Button>
              {hasQuickTraceView && (
                <Button icon={<IconOpen />} href={eventJsonUrl} external>
                  {t('JSON')} (<FileSize bytes={event.size} />)
                </Button>
              )}
            </ButtonBar>
          </Layout.HeaderActions>
        </Layout.Header>
        <Layout.Body>
          <Layout.Main fullWidth={!isSidebarVisible}>
            {hasQuickTraceView && (
              <EventMetas
                event={event}
                organization={organization}
                projectId={this.projectId}
              />
            )}
            <Projects orgId={organization.slug} slugs={[this.projectId]}>
              {({projects}) => (
                <SpanEntryContext.Provider
                  value={{
                    getViewChildTransactionTarget: childTransactionProps => {
                      return getTransactionDetailsUrl(
                        organization,
                        childTransactionProps.eventSlug,
                        childTransactionProps.transaction,
                        location.query
                      );
                    },
                  }}
                >
                  <BorderlessEventEntries
                    organization={organization}
                    event={event}
                    project={projects[0] as Project}
                    showExampleCommit={false}
                    showTagSummary={false}
                    location={location}
                  />
                </SpanEntryContext.Provider>
              )}
            </Projects>
          </Layout.Main>
          {isSidebarVisible && (
            <Layout.Side>
              {!hasQuickTraceView && (
                <React.Fragment>
                  <EventMetadata
                    event={event}
                    organization={organization}
                    projectId={this.projectId}
                  />
                  <RootSpanStatus event={event} />
                </React.Fragment>
              )}
              <OpsBreakdown event={event} />
              <EventVitals event={event} />
              <TagsTable event={event} query={query} generateUrl={this.generateTagUrl} />
            </Layout.Side>
          )}
        </Layout.Body>
      </React.Fragment>
    );
  }

  renderError(error: Error) {
    const notFound = Object.values(this.state.errors).find(
      resp => resp && resp.status === 404
    );
    const permissionDenied = Object.values(this.state.errors).find(
      resp => resp && resp.status === 403
    );

    if (notFound) {
      return <NotFound />;
    }
    if (permissionDenied) {
      return (
        <LoadingError message={t('You do not have permission to view that event.')} />
      );
    }

    return super.renderError(error, true, true);
  }

  renderComponent() {
    const {organization} = this.props;

    return (
      <SentryDocumentTitle
        title={t('Performance - Event Details')}
        objSlug={organization.slug}
      >
        {super.renderComponent()}
      </SentryDocumentTitle>
    );
  }
}

export default EventDetailsContent;
