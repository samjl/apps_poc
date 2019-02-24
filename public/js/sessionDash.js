let sessionDash = (function() {
  let sessionDash = {
    socket: undefined,
    connected: false,
    vars: {},
    trackingTriggerBuild: undefined,
    testIdDict: Object.create(null),
    sessions: {},
  };

  sessionDash.allSessionsOutcomes = function() {
    let nonZeroSummary = {
      collected: 0,
      complete: 0,
      outcomes: {}
    };
    for (let session in this.sessions) {
      nonZeroSummary.collected += this.sessions[session].collected;
      nonZeroSummary.complete += this.sessions[session].complete;
      for (let outcome in this.sessions[session].outcomes) {
        if (this.sessions[session].outcomes[outcome] > 0) {
          if (!nonZeroSummary.outcomes.hasOwnProperty(outcome)) {
            nonZeroSummary.outcomes[outcome] = this.sessions[session].outcomes[outcome];
          } else {
            nonZeroSummary.outcomes[outcome] += this.sessions[session].outcomes[outcome];
          }
        }
      }
    }
    sessionDash.updateSessionOutcome(nonZeroSummary, 'All Sessions', 'overallStatus');
  };

  sessionDash.updateSessionOutcome = function(summary, title, addToElementId) {
    let outcomes = `
      <p style="display: inline"> ${title}:</p>
      <p style="display: inline;font-weight: bold">collected: ${summary.collected}</p>
      <p style="display: inline;font-weight: bold">complete: ${summary.complete}</p>`;
    for (let outcome in summary.outcomes) {
      let percent = calc_percent(summary.outcomes[outcome], summary.collected);
      outcomes += `
        <p style="display: inline;font-weight: bold;color: ${outcomeColour(outcome)}">
          ${outcome}: ${summary.outcomes[outcome]} (${percent})%
        </p>`
    }
    $('#' + addToElementId).html(`${outcomes}`);
  };

  sessionDash.sessionOutcomes = function(sessionId) {
    let nonZeroSummary = {
      collected: this.sessions[sessionId].collected,
      complete: this.sessions[sessionId].complete,
      outcomes: {}
    };
    for (let outcome in this.sessions[sessionId].outcomes) {
      if (this.sessions[sessionId].outcomes[outcome] > 0) {
        if (!nonZeroSummary.outcomes.hasOwnProperty(outcome)) {
          nonZeroSummary.outcomes[outcome] = this.sessions[sessionId].outcomes[outcome];
        } else {
          nonZeroSummary.outcomes[outcome] += this.sessions[sessionId].outcomes[outcome]
        }
      }
    }
    // TODO add test rig name to title
    sessionDash.updateSessionOutcome(nonZeroSummary, 'Session ' + sessionId, 'outcomes' + sessionId);
  };

  sessionDash.addSession = function(sessionId, collected) {
    this.sessions[sessionId] = {
      collected: collected,
      complete: 0,
      // All possible outcomes
      outcomes: {
        "passed": 0, // Pass
        "failed": 0, // Fail
        "error": 0,  // TODO check this is a valid outcome from pytest-phases
        "setup errored": 0, // Fail
        "teardown errored": 0, // Fail
        "skipped": 0, // Skip
        "setup skipped": 0, // Skip
        "teardown skipped": 0, // Skip
        "warned": 0, // Warn
        "setup warned": 0, // Warn
        "teardown warned": 0, // Warn
        "expected failure": 0,
        "unexpectedly passed": 0,
        "pytest-warning": 0,
        "collection error": 0,
        "Unknown result": 0,
        "in-progress": 0,
        "pending": 0,
      },
      history: [],
      future: [],
    };
    $('#eachSessionStatus').append(`
      <div id="outcomes${sessionId}"></div>
      <div id=visualStatus${sessionId} class="container"></div>
    `);
  };

  sessionDash.triggerTracking = function(data) {
    // If the jenkins trigger name and not number is specified then display
    // only the test sessions related to the latest jenkins trigger build
    // number.
    if (data.testVersion.hasOwnProperty('triggerJobNumber')) {
      if (this.vars.hasOwnProperty('triggerName') &&
          !this.vars.hasOwnProperty('triggerBuild') &&
          this.trackingTriggerBuild !== undefined &&
          this.trackingTriggerBuild !== data.testVersion.triggerJobNumber) {
        console.log('New trigger build detected (was: ' + this.trackingTriggerBuild
                    + ', now: ' + data.testVersion.triggerJobNumber + '),'
                    + ' remove existing sessions before adding new sessions.');
        // Remove all existing sessions rather than reloading the page.
        $('div[id^=session]').remove();
      }
      this.trackingTriggerBuild = data.testVersion.triggerJobNumber;
    }
  };

  sessionDash.updateVisualTestHistory = function(data, parentSessionId,
                                                 isHistory) {
    let sessionIds = data.sessionIds;
    for (let key in data.tests) {
      for (let i=0, n=data.tests[key].length; i<n; i++) {
        let testIndex = sessionDash.testIdDict[parentSessionId].indexOf(key) + 1;
        if (testIndex > 0) {
          let elementType = 'History';
          let historyIndex = Math.abs(i - 10);
          if (!isHistory) {
            // Future sessions
            elementType = 'Future';
            historyIndex = i + 1;
          }
          let element = document.getElementById(parentSessionId + '_' + testIndex + '_' + elementType + historyIndex);
          let color = "grey";
          let title = sessionIds[i];
          if (data.tests[key][i] !== null){
            let outcome = data.tests[key][i].outcome;
            color = outcomeColour(outcome);
            title += ' ' + outcome;
          } else {
            title += ' not run';
          }
          element.style.backgroundColor = color;
          element.title = title;
        }
      }
    }
  };

  sessionDash.addTestToSessionStatus = function(sessionId, testData) {
    console.log(sessionId);
    if (testData.status === 'complete') {
      console.log(sessionId);
      console.log(this);
      this.sessions[sessionId].complete++;
    }
    if (this.sessions[sessionId].outcomes.hasOwnProperty(testData.outcome)) {
      console.log(this);
      console.log(sessionId);
      if (testData.status === 'complete') {
        this.sessions[sessionId].outcomes[testData.outcome]++;
      }

      // avoid long element ids by giving each test function a unique index
      // let sessionId = sessionId.toString();
      let testId =  this.testIdDict[sessionId].push(testData.moduleName
        + '::' + testData.className + '::' + testData.testName);
      let uniqueId = sessionId + '_' + testId + '_';
      let toolTip = sessionId + ' ' + testData.moduleName + '::' +
        testData.className + '::' + testData.testName + ' ' + testData.outcome;
      let testVisual = `
      <div class="testOutcome" title="${toolTip}" style="background-color: ${outcomeColour(testData.outcome)};">
        <div id=${uniqueId}History class=historyFuture>
          <div id=${uniqueId}HistoryLine1 class="historyLine" style="display: flex;">
            <div id=${uniqueId}History1 title="N/A" class="historyItem" style="border-left: 0px; border-top: 0px;"></div>
            <div id=${uniqueId}History2 title="N/A" class="historyItem" style="border-top: 0px; border-left: 0px"></div>
            <div id=${uniqueId}History3 title="N/A" class="historyItem" style="border-top: 0px; border-left: 0px"></div>
            <div id=${uniqueId}History4 title="N/A" class="historyItem" style="border-top: 0px; border-left: 0px"></div>
            <div id=${uniqueId}History5 title="N/A" class="historyItem" style="border-top: 0px; border-left: 0px"></div>
          </div>
          <div id=test1HistoryLine2 class="historyLine" style="display: flex;">      
            <div id=${uniqueId}History6 title="N/A" class="historyItem" style="border-top: 0px; border-left: 0px"></div>
            <div id=${uniqueId}History7 title="N/A" class="historyItem" style="border-top: 0px; border-left: 0px"></div>
            <div id=${uniqueId}History8 title="N/A" class="historyItem" style="border-top: 0px; border-left: 0px"></div>
            <div id=${uniqueId}History9 title="N/A" class="historyItem" style="border-top: 0px; border-left: 0px"></div>
            <div id=${uniqueId}History10 title="N/A" class="historyItem" style="border-top: 0px; border-left: 0px"></div>
          </div>
        </div>
        <div id=${uniqueId}Future class=historyFuture>
          <div id=${uniqueId}FutureLine1 class="historyLine" style="display: flex; justify-content: flex-end">
            <div id=${uniqueId}Future1 title="N/A" class="historyItem" style="border-bottom: 0px; border-right: 0px"></div>
            <div id=${uniqueId}Future2 title="N/A" class="historyItem" style="border-bottom: 0px; border-right: 0px"></div>
            <div id=${uniqueId}Future3 title="N/A" class="historyItem" style="border-bottom: 0px; border-right: 0px"></div>
            <div id=${uniqueId}Future4 title="N/A" class="historyItem" style="border-bottom: 0px; border-right: 0px"></div>
            <div id=${uniqueId}Future5 title="N/A" class="historyItem" style="border-bottom: 0px; border-right: 0px"></div>
          </div>
          <div id=${uniqueId}FutureLine2 class="historyLine" style="display: flex; justify-content: flex-end">
            <div id=${uniqueId}Future6 title="N/A" class="historyItem" style="border-bottom: 0px; border-right: 0px"></div>
            <div id=${uniqueId}Future7 title="N/A" class="historyItem" style="border-bottom: 0px; border-right: 0px"></div>
            <div id=${uniqueId}Future8 title="N/A" class="historyItem" style="border-bottom: 0px; border-right: 0px"></div>
            <div id=${uniqueId}Future9 title="N/A" class="historyItem" style="border-bottom: 0px; border-right: 0px"></div>
            <div id=${uniqueId}Future10 title="N/A" class="historyItem" style="border-bottom: 0px; border-right: 0px"></div>
          </div>
        </div>
      </div>
      `;

      $('#visualStatus' + sessionId).append(testVisual);
    }
  }

  return sessionDash;
})();

$(window).ready(function() {
  sessionDash.socket = io('/session');

  sessionDash.socket.on('connect', function() {
    console.log("Session client connected");
    if (sessionDash.connected) {
      console.log("Don't resend parameters");
    } else {
      sessionDash.connected = true;
      window.location.href.replace(/[?&]+([^=&]+)=([^&]*)/gi, function(m, key, value) {
        sessionDash.vars[key] = value;
      });
      if (sessionDash.vars.hasOwnProperty('sessionIds')) {
        let parts = sessionDash.vars.sessionIds.split(',');
        let ids = [];
          parts.forEach(function(element) {
          ids.push(parseInt(element, 10));
        });
        sessionDash.vars.sessionIds = ids;
      }
      if (sessionDash.vars.hasOwnProperty('excludeIds')) {
        let parts = sessionDash.vars.excludeIds.split(',');
        let ids = [];
          parts.forEach(function(element) {
          ids.push(parseInt(element, 10));
        });
        sessionDash.vars.excludeIds = ids;
      }

      console.log("URL parameters:");
      console.log(sessionDash.vars);
      sessionDash.socket.emit('init', {
        params: sessionDash.vars
      });
    }
  });

  // Initial insert - currently populated fields:
  // sessionId, collected, status
  sessionDash.socket.on('session_insert', (data) => {
    console.log("Initial session insert received");
    console.log(data);
    sessionDash.triggerTracking(data);

    sessionDash.testIdDict[data.sessionId] = [];
    sessionDash.addSession(data.sessionId, data.collected.length);
    sessionDash.sessionOutcomes(data.sessionId);
    sessionDash.allSessionsOutcomes();

    $('#sessionRx').text(data.sessionId);
    $('#sessionCollected').text(data.collected.length);
    // $('#plan').text('Test plan: ' + data.plan);
    console.log('Received mongoDB insert session ' + data.sessionId +
      ' containing ' + data.collected.length + ' tests');
    $('#mainContainer').append(sessionTemplate(data));
  });

  // Existing session or session in-progress
  sessionDash.socket.on('session_full', (data) => {
    console.log('Completed session received with ID ' + data.sessionId);
    console.log(data);
    sessionDash.triggerTracking(data);

    $('#sessionRx').text(data.sessionId);
    $('#sessionCollected').text(data.collected.length);
    console.log('Received mongoDB full session ' + data.sessionId + ' containing '
      + data.collected.length + ' tests');
    $('#mainContainer').append(sessionTemplate(data));

    sessionDash.testIdDict[data.sessionId] = [];
    sessionDash.addSession(data.sessionId, data.collected.length);
    Object.entries(data.runOrder).forEach(function(k) {
      let runOrderIndex = k[0];
      // TODO check if the ID already exists (required for server restarts?)
      appendToRunOrder(runOrderIndex, k[1], data.sessionId);
      sessionDash.addTestToSessionStatus(data.sessionId, k[1]);
    });
    sessionDash.sessionOutcomes(data.sessionId);
    sessionDash.allSessionsOutcomes();

    // Progress (TODO if session is still in progress)
    if (data.hasOwnProperty('progress')) {
      $('#phase' + data.sessionId).text(data.progress.phase);
      $('#activeSetups' + data.sessionId).text(data.progress.activeSetups);
      appendComplete(data.progress.completed, data.sessionId);
      consoleScrollToEnd();
    }
  });

  sessionDash.socket.on('session_update', (data) => {
    console.log(data);
    if (data.hasOwnProperty('updatedFields')) {
      // TODO process this at the server end instead - just for array elements like runOrder
      Object.entries(data.updatedFields).forEach(function(k) {
        if (k[0].indexOf('runOrder') === 0) {
          // attribute starts with runOrder
          let re = /runOrder\.?(\d*)\.?(\w*)/gm;
          let my = re.exec(k[0]);
          console.log(my);
          let runOrderIndex = my[1];
          let runOrderParam = my[2];
          let testData;

          if (!runOrderIndex) {
            console.log('runOrder with no index detected - element 0');
            $('#module' + data.sessionId).text(k[1][0].moduleName);
            $('#class' + data.sessionId).text(k[1][0].className);
            $('#test' + data.sessionId).text(k[1][0].testName);
            appendToRunOrder(0, k[1][0], data.sessionId);
            testData = k[1][0];
            sessionDash.addTestToSessionStatus(data.sessionId, testData);
            if (sessionDash.sessions.hasOwnProperty(data.sessionId)) {
              sessionDash.updateVisualTestHistory(sessionDash.sessions[data.sessionId].history, data.sessionId, true);
              sessionDash.updateVisualTestHistory(sessionDash.sessions[data.sessionId].future, data.sessionId, false);
            }
          } else if (runOrderParam) { // TODO param update to first test?
            console.log('runOrder ' + runOrderIndex + ' param update - ' +
              runOrderParam + ': ' + k[1]);
            testData = {};
            testData[runOrderParam] = k[1];
            if (runOrderParam === "status" && k[1] === "complete") {
              $('#outcome_' + data.sessionId + '_' + runOrderIndex)
                .css('font-weight', 'bold');
              sessionDash.sessions[data.sessionId].complete++;
              let finalOutcome = $('#outcome_' + data.sessionId + '_' + runOrderIndex).text();
              if (sessionDash.sessions[data.sessionId].outcomes.hasOwnProperty(finalOutcome)) {
                sessionDash.sessions[data.sessionId].outcomes[finalOutcome]++;
              }
              sessionDash.sessionOutcomes(data.sessionId);
              sessionDash.allSessionsOutcomes();
            } else {
              let testElement = $('#' + runOrderParam + "_" + data.sessionId +
                '_' + runOrderIndex);
              testElement.text(k[1]);
              // Check for test function failure (worst-case) so use bold font.
              if (runOrderParam === 'outcome') {
                let fontColour = outcomeColour(k[1]);
                let fontWeight = 'normal';
                if (k[1] === "failed") {
                  fontWeight = 'bold';
                }
                testElement.css({
                    'font-weight': fontWeight,
                    'color': fontColour
                });
                let a = $('#visualStatus' + data.sessionId).children();
                a[runOrderIndex].style.backgroundColor = outcomeColour(testData.outcome);
              }
            }
          } else {
            console.log('runOrder full update/insert for index ' +
              runOrderIndex);
            testData = k[1];
            $('#module' + data.sessionId).text(k[1].moduleName);
            $('#class' + data.sessionId).text(k[1].className);
            $('#test' + data.sessionId).text(k[1].testName);
            appendToRunOrder(runOrderIndex, k[1], data.sessionId);
            sessionDash.addTestToSessionStatus(data.sessionId, testData);
            if (sessionDash.sessions.hasOwnProperty(data.sessionId)) {
              sessionDash.updateVisualTestHistory(sessionDash.sessions[data.sessionId].history, data.sessionId, true);
              sessionDash.updateVisualTestHistory(sessionDash.sessions[data.sessionId].future, data.sessionId, false);
            }
          }
        }
        if (k[0] === 'status') {
         $('#status' + data.sessionId).text(k[1]);
        }
        if (k[0] === 'progress.phase') {
          $('#phase' + data.sessionId).text(k[1]);
        }
        if (k[0] === 'progress.completed') {
          console.log(k[1]);
          appendComplete(k[1], data.sessionId);
          consoleScrollToEnd();
        }
        if (k[0].indexOf('progress.activeSetups') === 0) {  // add or remove from list
          let re = /progress\.activeSetups\.?(\d*)/gm;
          let my = re.exec(k[0]);
          let activeIndex = my[1];
          let activeSetupsElement = $('#activeSetups' + data.sessionId);
          if (!activeIndex) {
            // Complete list of active setup functions
            activeSetupsElement.text(k[1]);
          } else {
            // Addition of single element
            let current = activeSetupsElement.text();
            activeSetupsElement.text(current + ',' + k[1]);
          }

        }
      });
    }
  });

  sessionDash.socket.on('history', (data) => {
    sessionDash.sessions[data.parentSession].history = data.history;
    sessionDash.sessions[data.parentSession].future = data.future;
    sessionDash.updateVisualTestHistory(data.history, data.parentSession, true);
    sessionDash.updateVisualTestHistory(data.future, data.parentSession, false);
  });
});

function calc_percent(count, total) {
  return Math.round((count / total) * 100);
}

function consoleScrollToEnd() {
  let completeElement = $('#complete');
  let scrollH = completeElement.prop('scrollHeight');
  completeElement.scrollTop(scrollH);
}

// For forward and back history
$(window).on("popstate", function(e) {
  if (e.originalEvent.state !== null) {
    location.reload();
  }
});

function joinProperties(obj) {
  let joiner = '=';
  let separator = "&";
  return $.map(Object.getOwnPropertyNames(obj), function(k) {
    return [k, obj[k]].join(joiner)
  }).join(separator);
}

function modifySessionIds() {
  let sessionIds = $('#sessionId').val();
  let parts = sessionIds.split(',');
  let ids = [];
  parts.forEach(function(element) {
    ids.push(parseInt(element, 10));
  });
  let current = window.location.href;
  // Extract the parameters and modify them.
  let vars = {};
  current.replace(/[?&]+([^=&]+)=([^&]*)/gi, function(m, key, value) {
    vars[key] = value;
  });
  if (vars.hasOwnProperty('sessionIds')) {
    vars.sessionIds = ids.join(',');
    // Reconstruct the URL.
    current = current.split("?", 1)[0] + '?' + joinProperties(vars);
  } else if (jQuery.isEmptyObject(vars)) {
    current += "?sessionIds=" + ids.join(',');
  } else {
    current += "&sessionIds=" + ids.join(',');
  }
  window.history.pushState({}, '', current);
  location.reload();  // TODO emit message to server rather than refresh here?
}

function incrementSessionId() {
  // Increment just the first session ID in the list and refreshes
  let current = window.location.href;
  let vars = {};
  current.replace(/[?&]+([^=&]+)=([^&]*)/gi, function(m, key, value) {
    vars[key] = value;
  });
  if (vars.hasOwnProperty('sessionIds')) {
    let parts = vars.sessionIds.split(',');
    let current_id = parseInt(parts[0], 10);
    current = current.split("?", 1)[0] + '?sessionIds=' + (current_id + 1);
    window.history.pushState({}, '', current);
    location.reload();
  } else {
    console.log("Debug error: no session ID in url");
  }
}

function appendToRunOrder(index, data, sessionId) {
  let fontWeight = 'normal';
  let fontColour = outcomeColour(data.outcome);
  if (data.status === 'complete') {
     fontWeight = 'bold';
  }
  let url = new URL(window.location.href);
  url.pathname = 'test';
  url.search = '?session=' + sessionId + '&module=' + data.moduleName;
  $('#testsTable' + sessionId + ' tr:last').after(`
  <tr>
    <td><a href="${url.href}">${data.moduleName}</a></td>
    <td>${data.testName}</td>
    <td id="outcome_${sessionId}_${index}" style="font-weight: ${fontWeight}; color: ${fontColour}">${data.outcome}</td>
  </tr>`);
}

function sessionTemplate(data) {
  let jenkinsJob = '';
  if (data.testVersion.hasOwnProperty('jenkinsJobName') && data.testVersion.hasOwnProperty('jenkinsJobNumber')) {
    jenkinsJob = `
    <div>
      <p style="display: inline">Jenkins Test Session: </p>
      <p id="test_session${data.sessionId}" style="display: inline; font-weight: bold">${data.testVersion.jenkinsJobName} #${data.testVersion.jenkinsJobNumber}</p>
    </div>`;
  }
  let triggerJob = '';
  if (data.testVersion.hasOwnProperty('triggerJobName') && data.testVersion.hasOwnProperty('triggerJobNumber')) {
    triggerJob = `
    <div>
      <p style="display: inline">Jenkins Trigger: </p>
      <p id="trigger${data.sessionId}" style="display: inline; font-weight: bold">${data.testVersion.triggerJobName} #${data.testVersion.triggerJobNumber}</p>
    </div>`;
  }
  return `
  <div id="session${data.sessionId}" style="background: lightgrey">
    <p>Test Session (DB session ID: ${data.sessionId})</p>
    <div>
      <p style="display: inline">Embedded Version: </p>
      <p style="display: inline; font-weight: bold">${data.embeddedVersion.branchName}.${data.embeddedVersion.branchNumber}.${data.embeddedVersion.buildNumber}</p>
      <p style="display: inline"> (${data.embeddedVersion.type})</p>
    </div>
    ${jenkinsJob}
    ${triggerJob}
    <div>
      <p style="display: inline">Test Rig: </p>
      <p id="testrig${data.sessionId}" style="display: inline; font-weight: bold">${data.testRig}</p>
    </div>
    <div>
      <p style="display: inline">Status: </p>
      <p id="status${data.sessionId}" style="display: inline; font-weight: bold">${data.status}</p>
    </div>
    <p style="display: inline">Currently active setup functions:</p>
    <p id="activeSetups${data.sessionId}"></p>
    <div id="running${data.sessionId}">
      <table>
        <caption>Currently Running:</caption>
        <tr>
          <th style="width: 250px">Module</th>
          <th style="width: 200px">Class</th>
          <th style="width: 200px">Test Function</th>
          <th style="width: 150px">Test Phase</th>
        </tr>
        <tr>
          <td id="module${data.sessionId}">None</td>
          <td id="class${data.sessionId}">None</td>
          <td id="test${data.sessionId}">None</td>
          <td id="phase${data.sessionId}">None</td>
        </tr>
      </table>
    </div>
    <table id="testsTable${data.sessionId}">
      <caption>Test Results (ordered by execution time):</caption>
      <tr>
        <th style="width: 350px">Module</th>
        <th style="width: 350px">Test Function</th>
        <th style="width: 350px">Outcome (Bold when complete)</th>
      </tr>
    </table>
  </div>
  `;
}

function appendComplete(completed, sessionId) {
  let summary = '';
  for (let property in completed.verifications) {
    summary += property + ': ' + completed.verifications[property]+'; ';
  }
  if (summary === '') {
    summary = 'No saved results';
  }
  $('#complete').append('<p class="console">[' + sessionId + '] '
    + completed.moduleName + ' :: ' + completed.className + ' :: ' + completed.testName
    + ' :: ' +  completed.fixtureName + ' :: ' + completed.phase + ' :: '
    + completed.outcome + ' :: ' + summary + '</p>');
}

function outcomeColour(outcome) {
  let colour;
  switch (outcome) {
    case "unexpectedly passed":
    case "setup errored":
    case "teardown errored":
    case "failed":
      colour = "red";
      break;
    case "collections error":
    case "pytest-warning":
    case "setup warned":
    case "teardown warned":
    case "warned":
      colour = "orange";
      break;
    case "setup skipped":
    case "teardown skipped":
    case "skipped":
      colour = "yellow";
      break;
    case "expected failure":
    case "passed":
      colour = "green";
      break;
    default:
      colour = "black";
  }
  return colour;
}
