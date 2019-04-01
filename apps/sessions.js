
class SessionDashClientConn {
  constructor(_db, socket) {
    this._db = _db;
    this.socket = socket;
    this.changeStreamTrigger = null;
    this.changeStreamSession = null;

    this.socket.on('init', (data) => {
      if (!Object.keys(data.params).length) {
        console.log('No params received from client, get/track the most' +
          ' recent session.');
        this.sessionLatest();
      } else if (Object.keys(data.params).length === 1 &&
                 data.params.hasOwnProperty('triggerName')) {
        this.getTrackTrigger(data.params.triggerName);
      } else {
        this.getTrackSession(data.params);
      }
    });
  }

  async getTrackTrigger(name) {
    console.log('Track the latest trigger job');
    this.latestBuild = await this.sessionsLatestTriggerBuild(name);
    // Track live session inserts for the trigger job and check if the
    // triggerNumber has incremented in the insert change handler.
    let pipeline = [
      {
        $match: {'fullDocument.testVersion.triggerJobName': name}
      },
      {
        $project: {
          operationType: 1,
          updateDescription: 1,
          fullDocument: 1
        }
      }
    ];
    console.log("Starting change stream to track new trigger jobs " +
                "(incremented build number)");
    this.changeStreamTrigger = this._db.collection('sessions').watch(pipeline,
      {fullDocument: 'updateLookup'});
    this.changeStreamTrigger.on('change', (change) => {
      if (change.operationType === 'insert') {
        console.log('session ' + change.fullDocument.sessionId +
          ' insert (trigger change stream)');
        if (change.fullDocument.testVersion.hasOwnProperty('triggerJobNumber') &&
            this.latestBuild < change.fullDocument.testVersion.triggerJobNumber) {
          this.latestBuild = change.fullDocument.testVersion.triggerJobNumber;
          let pipeline = [
            {
              $match:
                {
                  'fullDocument.testVersion.triggerJobName': name,
                  'fullDocument.testVersion.triggerJobNumber': this.latestBuild
                }
            },
            {
              $project: {
                operationType: 1,
                updateDescription: 1,
                fullDocument: 1
              }
            }
          ];
          let findMatch = {
            'testVersion.triggerJobName': name,
            'testVersion.triggerJobNumber': change.fullDocument.testVersion.triggerJobNumber
          };
          // Track sessions inserted and get existing sessions with the
          // required trigger job name AND BUILD NUMBER.
          this.sessionsLive(pipeline);
          this.sessionsFindExisting(findMatch);
        }
      }
    });
    // Add the latest trigger job build number to the pipeline
    pipeline = [
      {
        $match:
          {
            'fullDocument.testVersion.triggerJobName': name,
            'fullDocument.testVersion.triggerJobNumber': this.latestBuild
          }
      },
      {
        $project: {
          operationType: 1,
          updateDescription: 1,
          fullDocument: 1
        }
      }
    ];
    let findMatch = {
      'testVersion.triggerJobName': name,
      'testVersion.triggerJobNumber': this.latestBuild
    };
    this.sessionsLive(pipeline);
    this.sessionsFindExisting(findMatch);
  }

  sessionLatest() {
    this._db.collection('sessioncounter').findOne({}, (err, item) => {
      if (item != null) {
        let params = {};
        params.sessionIds = [item.sessionId];
        this.getTrackSession(params);
      } else if (err != null) {
        console.log('Failed to get session counter with MongoDB err:' + err);
      } else {
        console.log('Failed to get session counter: no items returned');
      }
    });
  }

  async getTrackSession(params) {
    // TODO if sessionId check if session exists - if it does don't set up
    // the change stream?
    // Create the change stream pipeline and the find match using the parameters
    // passed from the client
    // branchName, branchNumber, buildNumber, sessionIds, excludedIds?
    let pipelineMatch = {};
    let findMatch = {};
    if (params.hasOwnProperty('branchName')) {
      pipelineMatch['fullDocument.embeddedVersion.branchName'] = params.branchName;
      findMatch['embeddedVersion.branchName'] = params.branchName;
    }
    if (params.hasOwnProperty('branchNumber')) {
      pipelineMatch['fullDocument.embeddedVersion.branchNumber'] = params.branchNumber;
      findMatch['embeddedVersion.branchNumber'] = params.branchNumber;
    }
    if (params.hasOwnProperty('buildNumber')) {
      pipelineMatch['fullDocument.embeddedVersion.buildNumber'] = params.buildNumber;
      findMatch['embeddedVersion.buildNumber'] = params.buildNumber;
    }
    // excludeIds and sessionIds are currently mutually exclusive
    if (params.hasOwnProperty('sessionIds')) {
      pipelineMatch['fullDocument.sessionId'] = {'$in': params.sessionIds};
      findMatch['sessionId'] = {'$in': params.sessionIds};
    }
    if (params.hasOwnProperty('excludeIds')) {
      pipelineMatch['fullDocument.sessionId'] = {'$nin': params.excludeIds};
      findMatch['sessionId'] = {'$nin': params.excludeIds};
    }
    if (params.hasOwnProperty('triggerName')) {
      pipelineMatch['fullDocument.testVersion.triggerJobName'] = params.triggerName;
      findMatch['testVersion.triggerJobName'] = params.triggerName;
    }
    if (params.hasOwnProperty('triggerNumber')) {
      pipelineMatch['fullDocument.testVersion.triggerJobNumber'] = parseInt(params.triggerNumber);
      findMatch['testVersion.triggerJobNumber'] = parseInt(params.triggerNumber);
    }

    console.log('Retrieving exiting sessions using parameters:');
    console.log(findMatch);
    console.log('Track live/future sessions using parameters:');
    console.log(pipelineMatch);
    let pipeline = [
      {
        $match: pipelineMatch
      },
      {
        $project: {
          operationType: 1,
          updateDescription: 1,
          fullDocument: 1
        }
      }
    ];
    // Track changes
    this.sessionsLive(pipeline);
    // Find existing
    let existingSessions = await this.sessionsFindExisting(findMatch);
    // Find history and future sessions wrt to existingSessions
    // + jenkins trigger or jenkins job name
    for(let i = 0, len = existingSessions.length; i < len; i++) {
      this.jenkinsJobHistoryFuture(existingSessions[i].jenkinsJob,
        existingSessions[i].sessionId)
    }

  }

  sessionsLive(aggPipeline) {
    console.log("Starting sessions change stream");
    this.changeStreamSession = this._db.collection('sessions').watch(aggPipeline,
      {fullDocument: 'updateLookup'});
    this.changeStreamSession.on('change', (change) => {
      if (change.operationType === 'insert') {
        console.log('session ' + change.fullDocument.sessionId + ' insert (change stream)');
        this.socket.emit('session_insert', change.fullDocument);
        this.jenkinsJobHistoryFuture(change.fullDocument.jenkinsJob,
          change.fullDocument.sessionId)
      } else if (change.operationType === 'update'){
        console.log('session ' + change.fullDocument.sessionId + ' update (change stream)');
        // Add the session ID to then transmitted update.
        change.updateDescription.sessionId = change.fullDocument.sessionId;
        this.socket.emit('session_update', change.updateDescription);
      } else {
        console.log('Unhandled change operation (' + change.operationType + ')');
      }
    });
  }

  async sessionsFindExisting(findMatch) {
    console.log('Finding existing sessions');
    let err, docs = await this._db.collection('sessions').find(findMatch).toArray();
    if (err) {
      console.log('Finding existing sessions failed with error:');
      console.log(err);
    } else if (docs.length === 0) {
      console.log('Failed to find any existing sessions');
    } else {
      console.log('find returned ' + docs.length + ' session docs');
      let sessionIds = [];
      for(let i = 0, len = docs.length; i < len; i++) {
        this.socket.emit('session_full', docs[i]);
        sessionIds.push({
          sessionId: docs[i].sessionId,
          jenkinsJob: docs[i].testVersion.jenkinsJobName
        })
      }
      return sessionIds;
    }
  }

  async jenkinsJobHistoryFuture(jobName, sessionId) {
    let all = {jobName: jobName};
    all.history = await this.jenkinsJobFind(jobName, sessionId, "$lt", -1);
    all.future = await this.jenkinsJobFind(jobName, sessionId, "$gt", 1);
    console.log('Session ID ' + sessionId + ' found ' + all.history.length +
      ' history sessions and ' + all.future.length + ' future sessions');
    let foo = {
      jobName: jobName,
      parentSession: sessionId,
    };
    foo.history = this.testHistory(all.history);
    foo.future = this.testHistory(all.future);
    this.socket.emit('history', foo);
  }
  
  testHistory(docs) {
    let testOrdered = {
      sessionIds: [],
      tests: {},
    };
    for (let i=0, n=docs.length; i<n; i++) {
      // Add the session ID
      testOrdered.sessionIds.push(docs[i].sessionId);
      for (let j=0, n=docs[i].runOrder.length; j<n; j++) {
        let attrName = docs[i].runOrder[j].moduleName + '::' +
          docs[i].runOrder[j].className + '::' +
          docs[i].runOrder[j].testName;
        if (!testOrdered.tests.hasOwnProperty(attrName)) {
          testOrdered.tests[attrName] = new Array(docs.length);
        }
        testOrdered.tests[attrName][i] = {
          'outcome': docs[i].runOrder[j].outcome,
          'status': docs[i].runOrder[j].status,
          // + duration if required
        };
      }
    }
    return testOrdered;
  }
  
  async jenkinsJobFind(jobName, sessionId, sessionCondition, sessionSortOrder) {
    let findMatch = {
      sessionId: {},
      "testVersion.jenkinsJobName": jobName
    };
    findMatch.sessionId[sessionCondition] = sessionId;
    let options = {
      sort: {sessionId: sessionSortOrder},
      limit: 10,
      projection: {runOrder: 1, sessionId: 1, status: 1},
    };
    let err, docs = await this._db.collection('sessions').find(findMatch, options).toArray();
    if (err) {
      console.log('Finding existing sessions failed with error:');
      console.log(err);

    } else if (docs.length === 0) {
      console.log('Failed to find any existing sessions (' + sessionCondition +
        ' ' + sessionId + ', ' + jobName + ')');
    } else {
      return docs;
    }
    return [];
  }

  async sessionsLatestTriggerBuild(jobName) {
    let findMatch = {
      'testVersion.triggerJobName': jobName
    };
    let options = {
      sort: {'testVersion.triggerJobNumber': -1},
      projection: {"testVersion.triggerJobNumber": 1},
      limit: 1
    };
    // response is an array of 1 item
    let err, response = await this._db.collection('sessions').find(findMatch, options).toArray();
    if (err) {
      console.log('Failed to find latest build number for trigger job ' + jobName);
      console.log(err);
    } else if (response.length === 0) {
      console.log('Failed to find session doc for latest build number for' +
        ' trigger job ' + jobName);
    } else {
      return response[0].testVersion.triggerJobNumber;
    }
  }

  closeChangeStreams() {
    let changeStreamKeys = ['Trigger', 'Session'];
    for (let i = 0, n=changeStreamKeys.length; i<n; i++) {
      let key = 'changeStreamSession' + changeStreamKeys[i];
      if (this[key]) {
        console.log('Closing change stream ' + key);
      }
    }
  }
}

module.exports.SessionDashClientConn = SessionDashClientConn;
