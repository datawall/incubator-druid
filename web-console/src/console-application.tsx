/*
 * Licensed to the Apache Software Foundation (ASF) under one
 * or more contributor license agreements.  See the NOTICE file
 * distributed with this work for additional information
 * regarding copyright ownership.  The ASF licenses this file
 * to you under the Apache License, Version 2.0 (the
 * "License"); you may not use this file except in compliance
 * with the License.  You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { Intent } from '@blueprintjs/core';
import { IconNames } from '@blueprintjs/icons';
import axios from 'axios';
import * as classNames from 'classnames';
import * as React from 'react';
import { HashRouter, Route, Switch } from 'react-router-dom';

import { HeaderActiveTab, HeaderBar } from './components/header-bar';
import {Loader} from './components/loader';
import { AppToaster } from './singletons/toaster';
import { UrlBaser } from './singletons/url-baser';
import {QueryManager} from './utils';
import {DRUID_DOCS_API, DRUID_DOCS_SQL, LEGACY_COORDINATOR_CONSOLE, LEGACY_OVERLORD_CONSOLE} from './variables';
import { DatasourcesView } from './views/datasource-view';
import { HomeView } from './views/home-view';
import { LookupsView } from './views/lookups-view';
import { SegmentsView } from './views/segments-view';
import { ServersView } from './views/servers-view';
import { SqlView } from './views/sql-view';
import { TasksView } from './views/tasks-view';

import './console-application.scss';

export interface ConsoleApplicationProps extends React.Props<any> {
  hideLegacy: boolean;
  baseURL?: string;
  customHeaderName?: string;
  customHeaderValue?: string;
}

export interface ConsoleApplicationState {
  aboutDialogOpen: boolean;
  noSqlMode: boolean;
  capabilitiesLoading: boolean;
}

export class ConsoleApplication extends React.Component<ConsoleApplicationProps, ConsoleApplicationState> {
  static MESSAGE_KEY = 'druid-console-message';
  static MESSAGE_DISMISSED = 'dismissed';
  private capabilitiesQueryManager: QueryManager<string, string>;

  static async discoverCapabilities(): Promise<'working-with-sql' | 'working-without-sql' | 'broken'> {
    try {
      await axios.post('/druid/v2/sql', { query: 'SELECT 1337' });
    } catch (e) {
      const { response } = e;
      if (response.status !== 405 || response.statusText !== 'Method Not Allowed') return 'working-with-sql'; // other failure
      try {
        await axios.get('/status');
      } catch (e) {
        return 'broken'; // total failure
      }
      // Status works but SQL 405s => the SQL endpoint is disabled
      return 'working-without-sql';
    }
    return 'working-with-sql';
  }

  static shownNotifications(capabilities: string) {
    let message: JSX.Element = <></>;
    /* tslint:disable:jsx-alignment */
    if (capabilities === 'working-without-sql') {
      message = <>
        It appears that the SQL endpoint is disabled. The console will fall back
        to <a href={DRUID_DOCS_API} target="_blank">native Druid APIs</a> and will be
        limited in functionality. Look at <a href={DRUID_DOCS_SQL} target="_blank">the SQL docs</a> to
        enable the SQL endpoint.
      </>;
    } else if (capabilities === 'broken') {
      message = <>
        It appears that the Druid is not responding. Data cannot be retrieved right now
      </>;
    }
    /* tslint:enable:jsx-alignment */
    AppToaster.show({
      icon: IconNames.ERROR,
      intent: Intent.DANGER,
      timeout: 120000,
      message: message
    });
  }

  private taskId: string | null;
  private datasource: string | null;
  private onlyUnavailable: boolean | null;
  private initSql: string | null;
  private middleManager: string | null;

  constructor(props: ConsoleApplicationProps, context: any) {
    super(props, context);
    this.state = {
      aboutDialogOpen: false,
      noSqlMode: false,
      capabilitiesLoading: true
    };

    if (props.baseURL) {
      axios.defaults.baseURL = props.baseURL;
      UrlBaser.baseURL = props.baseURL;
    }
    if (props.customHeaderName && props.customHeaderValue) {
      axios.defaults.headers.common[props.customHeaderName] = props.customHeaderValue;
    }

    this.capabilitiesQueryManager = new QueryManager({
      processQuery: async (query: string) => {
        const capabilities = await ConsoleApplication.discoverCapabilities();
        if (capabilities !== 'working-with-sql') {
          ConsoleApplication.shownNotifications(capabilities);
        }
        return capabilities;
      },
      onStateChange: ({ result, loading, error }) => {
        this.setState({
          noSqlMode: result === 'working-with-sql' ? false : true,
          capabilitiesLoading: loading
        });
      }
    });
  }

  componentDidMount(): void {
    this.capabilitiesQueryManager.runQuery('dummy');
  }

  componentWillUnmount(): void {
    this.capabilitiesQueryManager.terminate();
  }

  private resetInitialsDelay() {
    setTimeout(() => {
      this.taskId = null;
      this.datasource = null;
      this.onlyUnavailable = null;
      this.initSql = null;
      this.middleManager = null;
    }, 50);
  }

  private goToTask = (taskId: string) => {
    this.taskId = taskId;
    window.location.hash = 'tasks';
    this.resetInitialsDelay();
  }

  private goToSegments = (datasource: string, onlyUnavailable = false) => {
    this.datasource = `"${datasource}"`;
    this.onlyUnavailable = onlyUnavailable;
    window.location.hash = 'segments';
    this.resetInitialsDelay();
  }

  private goToMiddleManager = (middleManager: string) => {
    this.middleManager = middleManager;
    window.location.hash = 'servers';
    this.resetInitialsDelay();
  }

  private goToSql = (initSql: string) => {
    this.initSql = initSql;
    window.location.hash = 'sql';
    this.resetInitialsDelay();
  }

  render() {
    const { hideLegacy } = this.props;
    const { noSqlMode, capabilitiesLoading } = this.state;

    const wrapInViewContainer = (active: HeaderActiveTab, el: JSX.Element, scrollable = false) => {
      return <>
        <HeaderBar active={active} hideLegacy={hideLegacy}/>
        <div className={classNames('view-container', { scrollable })}>{el}</div>
      </>;
    };

    if (capabilitiesLoading) {
      return <div className={'loading-capabilities'}>
        <Loader
          loadingText={''}
          loading={capabilitiesLoading}
        />
      </div>;
    }

    return <HashRouter hashType="noslash">
      <div className="console-application">
        <Switch>
          <Route
            path="/datasources"
            component={() => {
              return wrapInViewContainer('datasources', <DatasourcesView goToSql={this.goToSql} goToSegments={this.goToSegments} noSqlMode={noSqlMode}/>);
            }}
          />
          <Route
            path="/segments"
            component={() => {
              return wrapInViewContainer('segments', <SegmentsView datasource={this.datasource} onlyUnavailable={this.onlyUnavailable} goToSql={this.goToSql} noSqlMode={noSqlMode}/>);
            }}
          />
          <Route
            path="/tasks"
            component={() => {
              return wrapInViewContainer('tasks', <TasksView taskId={this.taskId} goToSql={this.goToSql} goToMiddleManager={this.goToMiddleManager} noSqlMode={noSqlMode}/>, true);
            }}
          />
          <Route
            path="/servers"
            component={() => {
              return wrapInViewContainer('servers', <ServersView middleManager={this.middleManager} goToSql={this.goToSql} goToTask={this.goToTask} noSqlMode={noSqlMode}/>, true);
            }}
          />
          <Route
            path="/sql"
            component={() => {
              return wrapInViewContainer('sql', <SqlView initSql={this.initSql}/>);
            }}
          />
          <Route
            path="/lookups"
            component={() => {
              return wrapInViewContainer('lookups', <LookupsView />);
            }}
          />
          <Route
            component={() => {
              return wrapInViewContainer(null, <HomeView noSqlMode={noSqlMode}/>);
            }}
          />
        </Switch>
      </div>
    </HashRouter>;
  }
}
