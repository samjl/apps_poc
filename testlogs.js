module.exports.getTestLogs = getTestLogs;

function getTestLogs(_db, socket, session, module) {
  // Start the DB change stream - get any new logs inserted
  liveModuleLogsAndVers(_db, socket, session, module);
  // Get any logs and verifications that have already been inserted to the DB
  existingModuleLogsAndVers(_db, socket, session, module);
}

function existingModuleLogsAndVers(_db, socket, session, module) {
  // Could be duplicates with updates from change stream already set up
  // but this ensures no logs are missed.
  let match = {'sessionId': parseInt(session), 'moduleName': module};
  existingTestLogs(_db, socket, match);
  existingVerifications(_db, socket, match)
}

function liveModuleLogsAndVers(_db, socket, session, module) {
  // Start change streams to monitor inserts to the loglinks and verifications
  // collections for the specified session and module.
  let pipeline = [
    {
      $match: {'fullDocument.sessionId': parseInt(session), 'fullDocument.moduleName': module}
    },
    {
      $project: {
        operationType: 1,
        updateDescription: 1,
        fullDocument: 1
      }
    }
  ];
  testLogsLive(_db, socket, pipeline);
  verificationsLive(_db, socket, pipeline);
}

function testLogsLive(_db, socket, pipeline) {
  console.log("Starting loglinks changestream");
  let changeStream = _db.collection('loglinks').watch(pipeline,
    {fullDocument: 'updateLookup'});
  changeStream.on('change', function(change) {
    if (change.operationType === 'update') {
      let keys = Object.keys(change.updateDescription.updatedFields);
      // shoudln't be a list of log messages but just in case
      let msg_oids = [];
      for(let i = 0, len = keys.length; i < len; i++) {
        if (keys[i] === 'logIds') {
          // { logIds: [ Oid ] }
          msg_oids.push(change.updateDescription.updatedFields[keys[i]][0]);
        } else {
          // { 'logIds.1': Oid }
          msg_oids.push(change.updateDescription.updatedFields[keys[i]]);
        }
        let match = {'_id': {'$in': msg_oids}};
        const logsPromise = _db.collection('testlogs').find(match).toArray();
        logsPromise
          .then(function testLogs(logs) {
            while (logs.length>0) {
              // Currently 500 message chunks gives the best client side performance
              // Just 1 message at a time here for updates
              socket.emit('saved messages', logs.splice(0, 500));
            }
          })
          .catch(function whenErr(err) {
            console.log('Error');
            console.log(err);
          });
      }
    }
  });
}

function verificationsLive(_db, socket, pipeline) {
  console.log("Starting loglinks changestream");
  let changeStream = _db.collection('verifications').watch(pipeline,
    {fullDocument: 'updateLookup'});
  changeStream.on('change', function(change) {
    if (change.operationType === 'insert') {
      socket.emit('verification', change.fullDocument);
    }
  });
}

function existingTestLogs(_db, socket, match) {
  const linksPromise = _db.collection('loglinks').find(match).toArray();
  linksPromise
    .then(function testLogLinks(links) {
      console.log('Found ' + links.length + ' loglink docs');
      let allLogLinks = [];
      for (let i = 0, len = links.length; i < len; i++) {
        console.log('Test: ' + links[i].testName + ' - Number of log links:' +
          ' ' + links[i].logIds.length);
        Array.prototype.push.apply(allLogLinks, links[i].logIds);
      }
      console.log('Total logs for module: ' + allLogLinks.length);
      match = {'_id': {'$in': allLogLinks}};
      // Now retrieve the logs from the list of _id's
      return _db.collection('testlogs').find(match).toArray();
    })
    .then(function testLogs(logs) {
      console.log('Number of log message docs retrieved: ' + logs.length);
      while (logs.length > 0) {
        // Currently 500 message chunks gives the best client side performance
        socket.emit('saved messages', logs.splice(0, 500));
      }
      console.log('Done - all test logs emitted');
    })
    .catch(function whenErr(err) {
      console.log('Error');
      console.log(err);
    });
}

function existingVerifications(_db, socket, match) {
  const verifyPromise = _db.collection('verifications').find(match).toArray();
  verifyPromise
    .then(function verifications(docs) {
      console.log('Number of verification docs retrieved: ' + docs.length);
      while (docs.length>0) {
        // Currently 500 message chunks gives the best client side performance
        // TODO ensure these are in time order
        socket.emit('all verifications', docs.splice(0, 500));
      }
      console.log('Done - all verifications emitted');
    })
    .catch(function whenErr(err) {
      console.log('Error');
      console.log(err);
    });
}