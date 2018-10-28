
class SessionDashClientConn {
  constructor(_db, socket) {
    this._db = _db;
    this.socket = socket;

    this.socket.on('from', (data) => {
      if (!Object.keys(data.params).length) {
        console.log('No params received from client, get/track the most' +
          ' recent session.');
        this.sessionLatest();
      } else {
        this.getTrackSession(data.params);
      }
    });
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

}

module.exports.SessionDashClientConn = SessionDashClientConn;