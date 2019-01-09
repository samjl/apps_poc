
class SessionDashClientConn {
  constructor(_db, socket) {
    this._db = _db;
    this.socket = socket;

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
    this.triggerChangeStream = this._db.collection('sessions').watch(pipeline,
      {fullDocument: 'updateLookup'});
    this.triggerChangeStream.on('change', (change) => {
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

  getTrackSession(params) {
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
    this.sessionsFindExisting(findMatch);
  }

  sessionsLive(aggPipeline) {
    console.log("Starting sessions change stream");
    this.changeStream = null;
    this.changeStream = this._db.collection('sessions').watch(aggPipeline,
      {fullDocument: 'updateLookup'});
    this.changeStream.on('change', (change) => {
      if (change.operationType === 'insert') {
        console.log('session ' + change.fullDocument.sessionId + ' insert (change stream)');
        this.socket.emit('session_insert', change.fullDocument);
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

  sessionsFindExisting(findMatch) {
    console.log('Finding existing sessions');
    const sessionPromise = this._db.collection('sessions').find(findMatch).toArray();
    sessionPromise
      .then((docs) => {
        console.log('find returned ' + docs.length + ' session docs');
        for(let i = 0, len = docs.length; i < len; i++) {
          console.log('session ' + docs[i].sessionId + ' full (find)');
          this.socket.emit('session_full', docs[i]);
        }
      })
      .catch((err) => {
        console.log('Error');
        console.log(err);
      });
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

}

module.exports.SessionDashClientConn = SessionDashClientConn;
