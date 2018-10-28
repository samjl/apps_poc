let sessionDash = (function() {
  let sessionDash = {
    socket: undefined,
    connected: false
  };
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
      let vars = {};
      window.location.href.replace(/[?&]+([^=&]+)=([^&]*)/gi, function(m, key, value) {
        vars[key] = value;
      });
      if (vars.hasOwnProperty('sessionIds')) {
        let parts = vars.sessionIds.split(',');
        let ids = [];
          parts.forEach(function(element) {
          ids.push(parseInt(element, 10));
        });
        vars.sessionIds = ids;
      }
      if (vars.hasOwnProperty('excludeIds')) {
        let parts = vars.excludeIds.split(',');
        let ids = [];
          parts.forEach(function(element) {
          ids.push(parseInt(element, 10));
        });
        vars.excludeIds = ids;
      }

      console.log(vars);
      sessionDash.socket.emit('init', {
        params: vars
      });
    }
  });

  // Initial insert - currently populated fields:
  // sessionId, collected, status
  sessionDash.socket.on('session_insert', (data) => {
    console.log("Initial session insert received");
    console.log(data);
    $('#sessionRx').text(data.sessionId);
    $('#sessionCollected').text(data.collected.length);
    // $('#plan').text('Test plan: ' + data.plan);
    $('#status').text(data.status);
    console.log('Received mongoDB insert session ' + data.sessionId +
      ' containing ' + data.collected.length + ' tests');
    $('#mainContainer').append(sessionTemplate(data));
  });

  // Existing session or session in-progress
  sessionDash.socket.on('session_full', (data) => {
    console.log('Completed session received with ID ' + data.sessionId);
    console.log(data);
    $('#sessionRx').text(data.sessionId);
    $('#sessionCollected').text(data.collected.length);
    // $('#plan').text('Test plan: ' + data.plan);
    $('#status').text(data.status);
    console.log('Received mongoDB full session ' + data.sessionId + ' containing '
      + data.collected.length + ' tests');
    $('#mainContainer').append(sessionTemplate(data));

    // Process (data.)runOrder
    Object.entries(data.runOrder).forEach(function(k) {
      let runOrderIndex = k[0];
      // TODO check if the ID already exists (required for server restarts?)
      appendToRunOrder(runOrderIndex, k[1], data.sessionId);
    });

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
          console.log(k);
          console.log("Found - " + k[0]);

          let re = /runOrder\.?(\d*)\.?(\w*)/gm;
          let my = re.exec(k[0]);
          console.log(my);
          let runOrderIndex = my[1];
          let runOrderParam = my[2];

          if (!runOrderIndex) {
            console.log('runOrder with no index detected - element 0');
            $('#module' + data.sessionId).text(k[1][0].moduleName);
            $('#class' + data.sessionId).text(k[1][0].className);
            $('#test' + data.sessionId).text(k[1][0].testName);
            appendToRunOrder(0, k[1][0], data.sessionId);
          } else if (runOrderParam) { // TODO param update to first test?
            console.log('runOrder ' + runOrderIndex + ' param update - ' +
              runOrderParam + ': ' + k[1]);
            if (runOrderParam === "status" && k[1] === "complete") {
              $('#outcome_' + data.sessionId + '_' + runOrderIndex)
                .css('font-weight', 'bold');
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
              }
            }
          } else {
            console.log('runOrder full update/insert for index ' +
              runOrderIndex);
            $('#module' + data.sessionId).text(k[1].moduleName);
            $('#class' + data.sessionId).text(k[1].className);
            $('#test' + data.sessionId).text(k[1].testName);
            appendToRunOrder(runOrderIndex, k[1], data.sessionId);
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
});

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
  location.reload();
}

function appendToRunOrder(index, data, sessionId) {
  let fontWeight = 'normal';
  let fontColour = outcomeColour(data.outcome);
  if (data.status === 'complete') {
     fontWeight = 'bold';
  }
  let url = new URL(window.location.href);
  url.pathname = '';
  url.search = '?session=' + sessionId + '&module=' + data.moduleName;
  $('#testsTable' + sessionId + ' tr:last').after(`
  <tr>
    <td><a href="${url.href}">${data.moduleName}</a></td>
    <td>${data.testName}</td>
    <td id="outcome_${sessionId}_${index}" style="font-weight: ${fontWeight}; color: ${fontColour}">${data.outcome}</td>
  </tr>`);
}

function sessionTemplate(data) {
  return `
  <div id="session${data.sessionId}" style="background: lightgrey">
    <p>Session ${data.sessionId}</p>
    <div>
      <p style="display: inline">Status: </p>
      <p id="status${data.sessionId}" style="display: inline; font-weight: bold">${data.status}</p>
    </div>
    <p style="display: inline">Currently active setup functions:</p>
    <p id="activeSetups${data.sessionId}"></p>
    <div id="running${data.sessionId}">
      <table>
        <caption>Live Running:</caption>
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