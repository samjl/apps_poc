
class TestLogClientConn {
  constructor(_db, socket) {
    this._db = _db;
    this.socket = socket;
    // attributes required for timed test log transmission and tracking
    this.collatedLogs = [];
    this.collatedUpdates = [];

    // Change streams
    this.changeStreamLogs = null;
    this.changeStreamVerify = null;
    this.changeStreamResults = null;
    this.changeStreamSession = null;
    this.changeStreamTest = null;

    this.streamMsgsRxd = 0;
    this.msgsTxd = 0;
    this.lastIndexTxd = 0;  // The message index of the last message

    this.streamUpdatesRxd = 0;
    this.updatesTxd = 0;
    this.lastUpdateIndexTxd = 0;

    this.sessionId = undefined;
    this.moduleName = undefined;
    this.pipeline = undefined;
    this.findMatch = undefined;
    this.projection = undefined;
    // transmitted. Note that this is not an array index.
    this.id = new Date().getMilliseconds();

    this.socket.on('init', async (data) => {
      // getTestLogs(_db, this.socket, data.params.session, data.params.module);
      this.sessionId = parseInt(data.params.session);
      this.moduleName = data.params.module;

      this.pipeline = [
        {
          $match: {
            'fullDocument.sessionId': this.sessionId,
            'fullDocument.moduleName': this.moduleName}
        },
        {
          $project: {
            operationType: 1,
            updateDescription: 1,
            fullDocument: 1
          }
        }
      ];
      // Check if the test status is complete, if it is there is no need to
      // create the change stream.
      this.findMatch = {
        'sessionId': this.sessionId,
        'moduleName': this.moduleName
      };
      this.projection = {
        '_id': 0,
        'status': 1
      };
      let err, doc = await this._db.collection('modules').findOne(
        this.findMatch, {'projection': this.projection});
      if (err) {
        console.log('Finding module status failed with error:');
        console.log(err);
      } else {
        // Events like timers (and button clicks etc.) have their own this
        // context so here we use alias the class context this to parent
        let parent = this;
        if (!doc || (doc.hasOwnProperty('status') && doc.status !== 'complete')) {
          this.testLogsLive(this.pipeline);
          this.timer = setInterval(function() {
            // console.log('Timer fired');
            let txData = parent.collatedLogs;
            if (txData.length > 0) {
              if (txData[txData.length - 1].index !== parent.lastIndexTxd) {
                parent.msgsTxd += txData.length;
                // console.log('Emitting ' + txData.length + ' logs, total transmitted ' +
                //   parent.msgsTxd);
                parent.socket.emit('saved messages', txData);
                parent.lastIndexTxd = txData[txData.length - 1].index;
              }
            }
            let txUpdates = parent.collatedUpdates;
            if (txUpdates.length > 0) {
              if (txUpdates[txUpdates.length - 1].index !== parent.lastUpdateIndexTxd) {
                parent.updatesTxd += txUpdates.length;
                parent.socket.emit('updated messages', txUpdates);
                parent.lastUpdateIndexTxd = txUpdates[txUpdates.length - 1].index;
              }
            }
          }, 500, this);
          this.testsOutcomeLive(this.pipeline);
          this.sessionProgressLive()
        }
        let logLinks = await this.testLogsLinks(this.findMatch);
        if (logLinks !== undefined) {
          await this.testLogsExisting(logLinks);
          this.testsOutcomeExisting(this.findMatch);
          // TODO if status id complete null the class after emitting logs
        }
      }
    });

    this.socket.on('init verifications', () => {
      const statusPromise = this._db.collection('modules').findOne(this.findMatch,
        this.projection);
      statusPromise
        .then((doc) => {
          if (!doc || (doc.hasOwnProperty('status') && doc.status !== 'complete')) {
            this.verificationsLive(this.pipeline);
          }
          this.verificationsExisting(this.findMatch);
        });
    });
  }

  // Test log stream updates can occur at a high enough frequency that the
  // server performance is adversely affected (emits are delayed significantly)
  // To work around this we collect the logs and emit them periodically
  // using a timer. Results in a delay in emitting the logs of up to the
  // value of the timer interval.
  testLogsLive(pipeline) {
    console.log("Starting logs change stream");
    // console.log(pipeline);
    this.changeStreamLogs = this._db.collection('testlogs').watch(pipeline,
      {fullDocument: 'updateLookup'});
    this.changeStreamLogs.on('change', (change) => {
      if (change.operationType === 'insert') {
        // console.log('Messages received: ' + this.streamMsgsRxd +
        //             ', messages transmitted: ' + this.msgsTxd);
        if (this.msgsTxd > 0 && this.streamMsgsRxd === this.msgsTxd) {
          // console.log('Clearing array');
          this.msgsTxd = 0;
          this.streamMsgsRxd = 0;
          this.collatedLogs = [];
        }
        this.collatedLogs.push(change.fullDocument);
        this.streamMsgsRxd += 1;
      } else if (change.operationType === 'update') {
        if (this.updatesTxd > 0 && this.streamUpdatesRxd === this.updatesTxd) {
          this.updatesTxd = 0;
          this.streamUpdatesRxd = 0;
          this.collatedUpdates = [];
        }
        this.collatedUpdates.push(change.fullDocument);
        this.streamUpdatesRxd += 1;
      }
    });
  }

  verificationsLive(pipeline) {
    console.log("Starting verifications change stream");
    this.changeStreamVerify = this._db.collection('verifications').watch(pipeline,
      {fullDocument: 'updateLookup'});
    this.changeStreamVerify.on('change', (change) => {
      if (change.operationType === 'insert') {
        // console.log("VERIFICATION INSERTED");
        // console.log(change);
        // TODO don't send test setup and teardown progress as it becomes
        // outdated - just send the fixture setup/teardown and test call
        this.socket.emit('verification', change.fullDocument);
      }
      // else {
      //   console.log('Unhandled change detected');
      // }
    });
  }

  testsOutcomeLive(pipeline) {
    console.log("Starting test result outcome change stream");
    this.changeStreamResults = this._db.collection('testresults').watch(pipeline,
      {fullDocument: 'updateLookup'});
    this.changeStreamResults.on('change', (change) => {
      if (change.operationType === 'insert') {
        let data = {};
        data._id = change.fullDocument._id;
        data.className = change.fullDocument.className;
        data.testName = change.fullDocument.testName;
        data.outcome = change.fullDocument.outcome;
        data.fixtures = change.fullDocument.fixtures;
        this.socket.emit('test outcome', [data])
      } else if (change.operationType === 'update') {
        // testresult updated
        let keys = Object.keys(change.updateDescription.updatedFields);
        for(let i = 0, len = keys.length; i < len; i++) {
          // Get the outcome phase/overall being updated
          let re = /outcome\.?(\w*)/gm;
          let my = re.exec(keys[i]);
          if (my){
            let outcomeField = my[1];
            // console.log("outcome." + my[1] + ": " + change.updateDescription.updatedFields[keys[i]]);
            let data = {};
            // FIXME only need to send the outcome here
            data.outcome = {};
            data._id = change.fullDocument._id;
            data.className = change.fullDocument.className;
            data.testName = change.fullDocument.testName;
            data.outcome[outcomeField] = change.updateDescription.updatedFields[keys[i]];
            data.fixtures = change.fullDocument.fixtures;
            this.socket.emit('test outcome', [data]);
          }
        }
      }
    });
  }

  sessionProgressLive() {
    let pipeline = [
      {$match: {'fullDocument.sessionId': this.sessionId}},
      {$project: {operationType: 1, updateDescription: 1}}
    ];
    this.changeStreamSession = this._db.collection('sessions').watch(pipeline,
      {fullDocument: 'updateLookup'});
    this.changeStreamSession.on('change', (change) => {
      if (change.operationType === 'update') {
        // console.log("SESSION PROGRESS UPDATE");
        let update = change.updateDescription.updatedFields;
        console.log(update);
        if (update.hasOwnProperty('progress.completed')) {
          if (update['progress.completed'].moduleName === this.moduleName) {
            // console.log('MODULE PROGRESS COMPLETED');
            // TODO check for test setup and teardown (not fixture) and
            // don't send
            console.log(update['progress.completed']);
            if (update['progress.completed'].fixtureName || update['progress.completed'].phase == 'call') {
              this.socket.emit('module progress', change.updateDescription.updatedFields['progress.completed']);
            }
          }
        }
        // Search for progress and runOrder - runOrder not really required as
        // monitoring testresults in liveTestResultsOutcome
      }
    });
  }

  async testLogsLinks(match) {
    let err, docs = await this._db.collection('loglinks').find(match).toArray();
    if (err) {
      console.log('Finding existing test log links failed with error:');
      console.log(err);
    } else if (docs.length === 0) {
      console.log('Failed to find any existing test log links');
    } else {
      let allLogIds = [];
      for (let i=0; i<docs.length; i++) {
        allLogIds.push(...docs[i].logIds)
      }
      console.log('find returned ' + docs.length + ' test log links docs,' +
        ' containing links to ' + allLogIds.length + ' log message docs');
      return allLogIds;
    }
  }

  async testLogsExisting(logLinks) {
    let logsMatch = {'_id': {'$in': logLinks}};
    // Now retrieve the logs from the list of _id's
    let err, docs = await this._db.collection('testlogs').find(logsMatch).toArray();
    if (err) {
      console.log('Finding existing test logs failed with error:');
      console.log(err);
    } else if (docs.length === 0) {
      console.log('Failed to find any existing test logs');
    } else {
      console.log('Number of log message docs retrieved: ' + docs.length);
      while (docs.length > 0) {
        // Currently 500 message chunks gives the best client side performance
        this.socket.emit('saved messages', docs.splice(0, 500));
      }
      console.log('Done - all test logs emitted');
    }
  }

  verificationsExisting(match) {
    const verifyPromise = this._db.collection('verifications').find(match).toArray();
    verifyPromise
      .then((docs) => {
        console.log('Number of verification docs retrieved: ' + docs.length);
        while (docs.length>0) {
          // Currently 500 message chunks gives the best client side performance
          // TODO ensure these are in time order
          this.socket.emit('all verifications', docs.splice(0, 500));
        }
        console.log('Done - all verifications emitted');
      })
      .catch((err) => {
        console.log('Error');
        console.log(err);
      });
  }

  testsOutcomeExisting(match) {
    let options = {
      'projection':
        {'className': 1, 'testName': 1, 'outcome': 1, 'fixtures': 1}
    };
    const testsResultsPromise = this._db.collection('testresults').find(match, options).toArray();
    testsResultsPromise
      .then((docs) => {
        console.log('Retrieved ' + docs.length + ' test result docs');
        this.socket.emit('test outcome', docs)
      })
      .catch((err) => {
        console.log('Error');
        console.log(err);
      });
  }

  closeChangeStreams() {
    let changeStreamKeys = ['Logs', 'Session', 'Results', 'Verify'];
    for (let i = 0, n=changeStreamKeys.length; i<n; i++) {
      let key = 'changeStream' + changeStreamKeys[i];
      if (this[key]) {
        console.log('Closing change stream ' + key);
      }
    }
  }
}

module.exports.TestLogClientConn = TestLogClientConn;
