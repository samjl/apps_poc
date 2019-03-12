let allMsgs = [];  // All messages as js objects
let activeMsgIndices = [];  // The current unfolded message indices
let activeHtml = [];  // Currently active (unfolded) message HTML markup
let clusterize;
let connected = false;
let txd_verify_init = false; // Message sent to server to initialise test
// verification document search and tracking
let previousClass;
let previousTest;
const minLevel = 0;
const maxLevel = 9;

/**
 * Parse the date and time received in the message as Date object and
 * return the format to be displayed (hours:minutes:seconds.milliseconds).
 * @param {string} rxTimestamp - The timestamp of the recieved message.
 * @returns {string} - The formatted message time to be displayed.
 */
function formatTimestamp(rxTimestamp) {
  let date = new Date(rxTimestamp);
  let ts = [date.getUTCHours(), date.getUTCMinutes(), date.getUTCSeconds(), date.getUTCMilliseconds()];
  for (let x = 0,  n=ts.length; x < n; x++) {
    if (ts[x] < 10) {
      ts[x] = "0" + ts[x];
    }
  }
  return ts[0] + ":" + ts [1] + ":" + ts[2] + "." + ts[3];
}

/**
 * Return the message folding display properties dependent upon whether the
 * message is a parent message or not.
 * @param {number} numOfChildren - The number of child messages (following
 * messages with a higher log level) the message has.
 * @returns {{container: (string), tooltip: (string), content: (string)}} -
 * Folding related display properties.
 */
function formatFolding(numOfChildren) {
  let display = {container: "", content: "", tooltip: ""};
  if (numOfChildren > 0) {
      if (userControls.foldAll == "on") {
        display.content = "+";
        display.tooltip = "Unfold higher level logs";
      } else {
        display.content = "-";
        display.tooltip = "Fold higher level logs";
      }
    } else {
      // Message is (currently) not a parent (has no children)
      display.container = "No";
    }
  return display
}

/**
 * Return style, style and number of elements used to indent the folding
 * controls.
 * @param {number} level - The log level of the message.
 * @param {number} step - The step index at the current log level.
 * @returns {{levelChange: (string), spacerWidth: (number), logLevelSpacers: (number)}}
 * - The display style of the level change element (msg*upLevel), the width of
 * the spacer between the timestamp and the fold controls (indentation),
 * the number of spacers between the fold controls and the level indicator.
 */
function getSpacerWidth(level, step) {
  let bodyStyles = window.getComputedStyle(document.body);
  let secondSize = bodyStyles.getPropertyValue('--secondary-size');
  let marginRight = bodyStyles.getPropertyValue('--margin-right');
  let spacerWidth = parseInt(secondSize.substring(0, secondSize.length-2)) +
    parseInt(marginRight.substring(0, marginRight.length-2));
  if (level > minLevel && step === 1) {
    return {
      levelChange: "block",
      spacerWidth: (level - minLevel - 1) * spacerWidth,
      logLevelSpacers: maxLevel - level - 1
    };
  } else {
    return {
      levelChange: "none",
      spacerWidth: (level - minLevel) * spacerWidth,
      logLevelSpacers: maxLevel - level - 1
    };
  }
}

/**
 * Determines whether a message is currently folded (not visible) or not.
 * This depends upon both the global "fold all" state and the fold state of
 * all the message's parents. If the global fold all is enabled or any
 * parents fold state is true then the message should be folded (not
 * visible).
 * @param {number} level - The log level of the message.
 * @param {[]} parentIndices - Parent message index (array indexed by
 * log level). Indices >= message level are invalid.
 * @return {boolean} - Whether the message is folded or not.
 */
function messageIsFolded(level, parentIndices) {
  if (level > minLevel) {
    if (userControls.foldAll) {
      return true;
    }
    for (let i = 0, n = level - minLevel; i < n; i++) {
      if (parentIndices[i] !== null &&
          allMsgs[parentIndices[i] - allMsgs[0].index].foldState) {
        // Return as soon as a parent control is set to fold all direct
        // children.
        return true;
      }
    }
  } // Message is at minimum level and cannot be folded away (hidden).
  return false;
}


/**
 * Convert a received new message or update to an object containing the
 * message details and the (client only) display properties.
 * @param {Object} rxMsg - Received message object.
 * @param {Object} existingMsg - An existing message object (same as created
 * by this function).
 * @returns {{level: (string|Object|string), index: *, step: (*|string), _id: *, message: Uint8Array, numOfChildren: *, indexClass: string, levelDisplay: {spacerWidth, levelChange, logLevelSpacers}, timestamp: *, parentIndices: *, parents: *, tags: *}}
 */
function constructMessage(rxMsg, existingMsg=null) {
  // Base message attributes applicable to new messages and updates.
  let msg = {
    // Received message params that do not change after being received
    message: utf8.encode(rxMsg.message),
    index: rxMsg.index,
    step: rxMsg.step,
    level: rxMsg.level,
    numOfChildren: rxMsg.numOfChildren,
    timestamp: formatTimestamp(rxMsg.timestamp),
    _id: rxMsg._id.slice(-4),
    parentIndices: rxMsg.parentIndices,
    parents: rxMsg.parents.map(function(item) {
      // DEBUG Used for debugging only - client side only uses the message
      //  indices above.
      return item.slice(-4);
    }),
    tags: rxMsg.tags,
    // Fixed display parameters. Visibility of index and tab spacers are
    // controlled by userControls.index and userControls.tabs respectively.
    indexClass: "index",
    levelDisplay: getSpacerWidth(rxMsg.level, rxMsg.step),
    type: rxMsg.type,
  };
  if (existingMsg) {
    // Updating an existing message when an update is received.
    msg.msgClass = existingMsg.msgClass;
    msg.levelClass = existingMsg.levelClass;
    msg.foldState = existingMsg.foldState;
    if (existingMsg.numOfChildren === 0 && rxMsg.numOfChildren > 0) {
      msg.foldDisplay = formatFolding(rxMsg.numOfChildren);
    } else {
      msg.foldDisplay = existingMsg.foldDisplay;
    }
  } else {
    // Initializing a new message's display attributes.
    msg.msgClass = getMessageTypeFormat(rxMsg.type, "Foreground");
    msg.levelClass = getMessageTypeFormat(rxMsg.type, "Background");
    if (userControls.foldAll == "on") {
      msg.foldState = true;
    } else {
      msg.foldState = false;
    }
    msg.foldDisplay = formatFolding(rxMsg.numOfChildren);
  }
  return msg;
}

/**
 * Construct a CSS3 class from the message type (result of a verification).
 * @param {string} msgType - The single character message type code.
 * @param {string} append - Append to the type string to form the CSS class.
 * @returns {string} msgClass - The CSS3 class name.
 */
function getMessageTypeFormat(msgType, append) {
  let msgClass = "";
  switch (msgType) {
  case 'F':
  case 'O':
    msgClass = 'fail' + append;
    break;
  case 'W':
    msgClass = 'warn' + append;
    break;
  case 'P':
    msgClass = 'pass' + append;
    break;
  }
  return msgClass
}

/** User interface control state. */
class UserControls {
  constructor() {
    this.index = true;  // initially checked / on
    this.ts = false;  // initially unchecked / off         flex, none
    this.folding = true;                                // flex, none
    this.tabs = true;                                   // block, none
    this.levels = true;                                 // flex and block, none
    this.steps = false;                                 // flex, none
    this.foldAll = undefined;
    this.basic = false;  // Whether basic or clusterize logs are displayed
    this.dev = false;
  }
}

let userControls = new UserControls();

/**
 * Return the CSS3 display type.
 * @param {boolean|undefined} control - Whether the control is enabled.
 * @returns {string} - CSS3 display type.
 */
function getDisplay(control) {
  if (control) {
    return "flex";
  } else {
    return "none";
  }
}

/**
 * Redo the entire active HTML array based upon the currently active
 * messages. Update and refresh clusterize.
 */
function updateActive() {
  // Reapply all global controls to template for every active (unfolded) message
  // Currently folded messages are updated with the global control state when they are unfolded (made active)
  activeHtml = [];  // Required for level filtering
  for (let i=0, n=activeMsgIndices.length; i<n; i++) {
    let allMsgsPosition = activeMsgIndices[i]-allMsgs[0].index;
    activeHtml[i] = getMarkup(allMsgs[allMsgsPosition]);
  }
  clusterize.update(activeHtml);
  clusterize.refresh(true);
}

/**
 * Update the log level selection drop down menu with the minimum and
 * maximum levels set in this module. These values are currently hardcoded,
 * a future enhancement is intended to receive these values from the server.
 * The hardcoded values in this module may be changed to suit the logging
 * application.
 */
function updateLevelDropDown() {
  for (let i=minLevel; i<=maxLevel; i++) {
    let levelText = i;
    if (i === maxLevel) {
      levelText = i + ' (All Levels)';
    }
    let optionElement = `<option value="${i}">${levelText}</option>`;
    $('#maxLevelDisplay').append(optionElement);
  }
}

$(window).ready(function(){
  // Set the height of the scroll area
  let contentHeight = document.getElementById("content").clientHeight;
  let scrollHeight = parseInt(contentHeight / 22) * 22;
  console.log("Content height: " + contentHeight + ", scroll height set to: " + scrollHeight);
  $("#scrollArea").css('max-height', scrollHeight + 'px');
  updateLevelDropDown();

  clusterize = new Clusterize({
    scrollId: 'scrollArea',
    contentId: 'contentArea'
  });

  $(document).on("click", ".containerFold", function() {
    let clickedMsgIndex = parseInt(this.id.slice(3, -4));
    // Update the parent message
    console.log("clicked message: " + clickedMsgIndex);
    let allMsgsPosition = clickedMsgIndex-allMsgs[0].index;
    console.log("allMsgs array position: " + allMsgsPosition);
    console.log("current child fold state is " + allMsgs[allMsgsPosition].foldState);
    console.log("number of children to process: " + allMsgs[allMsgsPosition].numOfChildren);
    let activeIndex = activeMsgIndices.indexOf(clickedMsgIndex);
    if (allMsgs[allMsgsPosition].foldState) {
      console.log("update clicked element (parent) to unfold, active index:" + " " + activeIndex);
      setParentUnfolded(allMsgsPosition);
      activeHtml[activeIndex] = getMarkup(allMsgs[allMsgsPosition]);

      console.log("unfold children");
      let insertActiveIndex = activeIndex + 1;
      for (let i=allMsgsPosition+1, n=allMsgsPosition+allMsgs[allMsgsPosition].numOfChildren; i<=n; i++) {
        if (activeMsgIndices.indexOf(allMsgs[i].index) === -1) {
          // Child is not already inserted
          if (allMsgs[i].foldState  && allMsgs[i].numOfChildren > 0) {
            // Child is a parent and is folded so add it and skip its children
            activeHtml.splice(insertActiveIndex, 0, getMarkup(allMsgs[i]));
            activeMsgIndices.splice(insertActiveIndex, 0, allMsgs[i].index);
            i += allMsgs[i].numOfChildren;
          } else {  // check the message
            activeHtml.splice(insertActiveIndex, 0, getMarkup(allMsgs[i]));
            activeMsgIndices.splice(insertActiveIndex, 0, allMsgs[i].index);
          }
        }
        insertActiveIndex++;
      }
    } else {
      console.log("update clicked element (parent) to fold, active index: " + activeIndex);
      setParentFolded(allMsgsPosition);
      activeHtml[activeIndex] = getMarkup(allMsgs[allMsgsPosition]);

      console.log("fold children");
      for (let i=activeIndex+1, n=activeIndex+allMsgs[allMsgsPosition].numOfChildren; i<=n; i++) {
        if (activeMsgIndices[activeIndex+1] <= activeMsgIndices[activeIndex]+allMsgs[allMsgsPosition].numOfChildren) {
          activeHtml.splice(activeIndex+1, 1);  // remove index for each subsequent child
          activeMsgIndices.splice(activeIndex+1, 1);
        } else {
          break;
        }
      }
    }
    clusterize.update(activeHtml);
    clusterize.refresh(true);
  });

  $(function () {
    let socket = io('/test');

    socket.on('connect', function() {
      console.log("Client connected");
      if (connected) {
        console.log("Don't resend parameters");
      } else {
        connected = true;
        let vars = {};
        window.location.href.replace(/[?&]+([^=&]+)=([^&]*)/gi, function(m, key, value) {
          vars[key] = value;
        });
        socket.emit('init', {
          params: vars
        });
      }
    });

    /**
     * 1+ new log messages received from the server.
     * These messages may be live messages as they are inserted into
     * the database as the test runs or messages that have previously been
     * inserted into the database.
     * @param {[]} docs - Array of log messages (documents).
     */
    socket.on('saved messages', function(docs){
      // TODO check for duplicate messages
      console.log(docs.length + " new messages received");
      for (let i=0, n=docs.length; i<n; i++) {
        let msg = constructMessage(docs[i]);
        allMsgs.push(msg);
        if (!messageIsFolded(msg.level, msg.parentIndices)) {
          let msgMarkup = getMarkup(msg);
          activeHtml.push(msgMarkup);
          activeMsgIndices.push(msg.index);
        }
        let msgIndex = msg.index - allMsgs[0].index;
        // If the message has a type (result of verify function or other
        // exception) then update the message's parent messages (color code).
        if (msg.type !== undefined) {
          applyVerification(msgIndex, msg.type);
        }
      };
      // Safe to retrieve existing verifications now (do this once)
      if (!txd_verify_init) {
        console.log('Sending init verifications');
        socket.emit('init verifications', {});
        txd_verify_init = true;
      }
      clusterize.update(activeHtml);
      clusterize.refresh(true);  // refresh to update the row heights
      // refresh seems to fix the following issues:
      // not being able to scroll to bottom/flickering
      // skipping records when scrolling past cluster transitions
    });
    /**
     * 1+ log updated messages from the server (Relevant to live tests only).
     * This indicates an increment to a parent message number of children
     * counter (required to update the number of children to fold).
     * @param {[]} docs - Array of log messages (documents).
     */
    socket.on('updated messages', function(docs){
      console.log(docs.length + " updated messages received");
      for (let i=0, n=docs.length; i<n; i++) {
        let allMsgsIndex = docs[i].index - allMsgs[0].index;
        allMsgs[allMsgsIndex] = constructMessage(docs[i], allMsgs[allMsgsIndex]);
        let activeIndex = activeMsgIndices.indexOf(docs[i].index);
        if (activeIndex !== -1) {
          activeHtml[activeIndex] = getMarkup(allMsgs[allMsgsIndex]);
        }
      };
      clusterize.update(activeHtml);
      clusterize.refresh(true);
    });
    socket.on('all verifications', function(allVerifications) {
      console.log('All verifications rx\'d (' + allVerifications.length + ')');
      for (let i = 0, len = allVerifications.length; i < len; i++) {
        $('#verifications').append(getVerifyMarkup(allVerifications[i]));
      }
    });
    socket.on('verification', function(verification) {
      $('#verifications').append(getVerifyMarkup(verification));
      console.log('Verification rx\'d for message with index ' +
        verification.indexMsg);
    });
    socket.on('module progress', function(progress) {
      $('#module_progress').append(getModuleProgressMarkup(progress));
    });
    socket.on('test outcome', function(data) {
      for (let i = 0, len = data.length; i < len; i++) {
        getModuleStatusMarkup(data[i]);
      }
    });
  });
});

/**
 * Use a child message type to update the parent style if required.
 * @param {number} msgIndex - The rx index of the message.
 * @param {string|null} msgType - The type of verification message (null
 * for regular log messages that are not linked to a verification document).
 */
function applyVerification(msgIndex, msgType) {
  console.log('Applying verification type ' + msgType +
    ' to message index (of rx\'d messages) ' + msgIndex);
  let levelClass = getMessageTypeFormat(msgType, 'Background');
  let hierarchy = ['pass', 'warn', 'fail'];
  for(let i = 0, len = allMsgs[msgIndex].parentIndices.length; i < len; i++) {
    let parentIndex = allMsgs[msgIndex].parentIndices[i] - allMsgs[0].index;
    if (allMsgs[msgIndex].parentIndices[i] === null || parentIndex === msgIndex) {
      break;
    }
    let parentClass = allMsgs[parentIndex].levelClass;
    if (hierarchy.indexOf(levelClass.substr(0, 4)) > hierarchy.indexOf(parentClass.substr(0, 4))) {
      console.log('Updating bg color for parent with rx index ' + parentIndex);
      allMsgs[parentIndex].levelClass = levelClass;
      let activeIndex = activeMsgIndices.indexOf(allMsgs[parentIndex].index);
      if(activeIndex !== -1) {
        activeHtml[activeIndex] = getMarkup(allMsgs[parentIndex]);
      }
    }
  }
}

/**
 * Set a parent message fold button style style to folded (children hidden
 * from user).
 * @param allMsgsIndex - The rx index of the message.
 */
function setParentFolded(allMsgsIndex) {
  allMsgs[allMsgsIndex].foldState = true;
  allMsgs[allMsgsIndex].foldDisplay.content = "+";
  allMsgs[allMsgsIndex].foldDisplay.tooltip = "Unfold higher level logs";
}

/**
 * Set a parent message fold button style style to unfolded (children
 * visible).
 * @param allMsgsIndex - The rx index of the message.
 */
function setParentUnfolded(allMsgsIndex) {
  allMsgs[allMsgsIndex].foldState = false;
  allMsgs[allMsgsIndex].foldDisplay.content = "-";
  allMsgs[allMsgsIndex].foldDisplay.tooltip = "Fold higher level logs";
}

/**
 * Apply HTML markup to a row in the module progress tag.
 * @param {Object} progress - Update object (DB document) received.
 * @returns {string} - HTML markup
 */
function getModuleProgressMarkup(progress) {
  let summary = '';
  let keys = Object.keys(progress.verifications);
  for (let i = 0, len = keys.length; i < len; i++) {
    summary += keys[i] + ': ' + progress.verifications[keys[i]] + ' ';
  }
  return `<tr>
    <td align="left" style="max-width: 250px; width: 250px">${progress.moduleName}</td>
    <td align="left" style="max-width: 250px; width: 250px">${progress.className}</td>
    <td align="left" style="max-width: 250px; width: 250px">${progress.testName}</td>
    <td align="left" style="max-width: 250px; width: 250px">${progress.fixtureName}</td>
    <td align="left" style="max-width: 150px; width: 150px">${progress.outcome}</td>
    <td align="left" style="max-width: 150px; width: 150px">${progress.phase}</td>
    <td align="left" style="max-width: 150px; width: 150px">${summary}</td>
  </tr>
  `;
}

/**
 * Add a test item to the test status tab.
 * @param {Object} data - Received test outcome update.
 */
function getModuleStatusMarkup(data) {
  if($('#status_' + data._id).length) {
    // Test status element already exists - update it
    console.log('Test ' + data._id + ' status already exists');
    let keys = Object.keys(data.outcome);
    for(let i = 0, len = keys.length; i < len; i++) {
      console.log('#' + keys[i] + '_' + data._id);
      $('#' + keys[i] + '_' + data._id).text(data.outcome[keys[i]]);
    }
  } else {
    $('#module_status').append(`
    <tr id="status_${data._id}">
      <td align="left" style="max-width: 250px; width: 250px">${data.className}</td>
      <td align="left" style="max-width: 250px; width: 250px">${data.testName}</td>
      <td id="setup_${data._id}" align="left" style="max-width: 150px; width: 150px">${data.outcome.setup}</td>
      <td id="call_${data._id}" align="left" style="max-width: 150px; width: 150px">${data.outcome.call}</td>
      <td id="teardown_${data._id}" align="left" style="max-width: 150px; width: 150px">${data.outcome.teardown}</td>
      <td id="overall_${data._id}" align="left" style="max-width: 150px; width: 150px">${data.outcome.overall}</td>
      <td id="fixtures_${data._id}" align="left" style="max-width: 500px;width: 500px">${data.fixtures}</td>
    </tr>
    `)
  }
}

/**
 * Create the HTML markup for a received verification object/DB document.
 * To be appended to the Verifications tab.
 * @param {Object} verifyData - Verification document received.
 * @returns {string} HTML markup for a verification.
 */
function getVerifyMarkup(verifyData) {
  // Time stamp
  // Create a new JavaScript Date object based on the timestamp
  // multiplied by 1000 so that the argument is in milliseconds, not seconds.
  let date = new Date(verifyData.timestamp * 1000);
  let hours = date.getHours();
  let minutes = "0" + date.getMinutes();
  let seconds = "0" + date.getSeconds();
  let millis = "00" + date.getMilliseconds();
  let formattedTime = hours + ':' + minutes.substr(-2) + ':' +
    seconds.substr(-2) + '.' + millis.substr(-3);
  // PASS, FAIL, WARNING or type, P, F, W, O
  let backgroundColor = 'white';
  switch (verifyData.type) {
    case 'F':
    case 'O':
      backgroundColor = '#fe2216';
      break;
    case 'W':
      backgroundColor = '#FE7100';
      break;
    case 'P':
      backgroundColor = '#90DD37';
      break;
  }
  // Formatting for phase: setup, call, teardown
  let phaseBackground = 'white';
  switch (verifyData.phase) {
    case 'call':
      phaseBackground = '#53adff';
      break;
  }
  // Formatting for scope: module, class, function
  let scopeBackground = 'white';
  switch (verifyData.scope) {
    case 'module':
      scopeBackground = '#fff057';
      break;
    case 'class':
      scopeBackground = '#f7a2ff';
      break;
    case 'function':
      scopeBackground = '#53adff';
      break;
  }
  // Detect new class or test
  let rowStyle = '';
  let currentClass;
  let currentTest;
  if (verifyData.className == null) {
    currentClass = 'null';
  } else {
    currentClass = verifyData.className;
  }
  if (verifyData.testName == null) {
    currentTest = 'null';
  } else {
    currentTest = verifyData.testName;
  }
  if (previousClass !== undefined && previousClass !== currentClass) {
    rowStyle = 'border-top: solid black;';  // dashed dotted
  } else if (previousTest !== undefined && previousTest !== currentTest) {
    rowStyle = 'border-top: double;';
  }
  previousClass = currentClass;
  previousTest = currentTest;
  return `
  <tr style="${rowStyle}">
    <td style="max-width: 150px; width: 150px;">${formattedTime}</td>
    <td style="max-width: 250px; width: 250px;">${verifyData.moduleName}</td>
    <td style="max-width: 75px; width: 75px;">${verifyData.className}</td>
    <td style="max-width: 150px; width: 150px;">${verifyData.testName}</td>
    <td style="max-width: 60px; width: 60px; background-color: ${phaseBackground};">${verifyData.phase}</td>
    <td style="max-width: 175px; width: 175px;">${verifyData.fixtureName}</td>
    <td style="max-width: 60px; width: 60px; background-color: ${scopeBackground};">${verifyData.scope}</td>
    <td style="max-width: 350px; width: 350px;">${verifyData.level1Msg}</td>
    <td style="max-width: 350px; width: 350px;">${verifyData.verifyMsg}</td>
    <td style="max-width: 100px; width: 100px; background-color: ${backgroundColor};">${verifyData.status}</td>
    <td style="max-width: 64px; width: 64px; padding: 0px; border: 0px">
      <input type="button" onclick="indexLinkClicked(${verifyData.indexMsg})" value="${verifyData.indexMsg}" 
      style="display: inline-block; position: relative; width:100%;  height:100%;">
    </td>
  </tr>
  `;
}

/**
 * Process a click event on a verification entry button that links to the
 * associated message. Scrolls the main log to the associated message.
 * @param {number} index - The rx index of the message.
 */
function indexLinkClicked(index) {
  let firstMsgIndex = allMsgs[0].index;
  if (activeMsgIndices.indexOf(index) === -1) {
    // Unfold all parents (if required), update, then scroll
    for(let i = 0, len = allMsgs[index - firstMsgIndex].parentIndices.length; i < len; i++) {
      let parentIndex = allMsgs[index - firstMsgIndex].parentIndices[i];
      let allMsgsPosition = parentIndex - firstMsgIndex;
      if(parentIndex === index) {
        break;
      } else if (allMsgs[allMsgsPosition].foldState) {
        setParentUnfolded(allMsgsPosition);
        let activeIndex = activeMsgIndices.indexOf(parentIndex);
        activeHtml[activeIndex] = getMarkup(allMsgs[allMsgsPosition]);
        let insertActiveIndex = activeIndex + 1;
        for (let i=allMsgsPosition+1, n=allMsgsPosition+allMsgs[allMsgsPosition].numOfChildren; i<=n; i++) {
          if (activeMsgIndices.indexOf(allMsgs[i].index) === -1) {
            // Child is not already inserted
            if (allMsgs[i].foldState  && allMsgs[i].numOfChildren > 0) {
              // Child is a parent and is folded so add it and skip its children
              activeHtml.splice(insertActiveIndex, 0, getMarkup(allMsgs[i]));
              activeMsgIndices.splice(insertActiveIndex, 0, allMsgs[i].index);
              i += allMsgs[i].numOfChildren;
            } else {  // check the message
              activeHtml.splice(insertActiveIndex, 0, getMarkup(allMsgs[i]));
              activeMsgIndices.splice(insertActiveIndex, 0, allMsgs[i].index);
            }
          }
          insertActiveIndex++;
        }
      } else {
        console.log("Parent with index " + parentIndex + " is unfolded");
      }
    }
    clusterize.update(activeHtml);
    clusterize.refresh(true);
  }
  let messageHeight = $(".containerMessage").first().height();
  let activeIndex = activeMsgIndices.indexOf(index);
  // Calculate scroll top based on message/row element height
  let itemScrollTop = activeIndex * messageHeight;
  // console.log("Scroll to line, message height: " + messageHeight + ", scroll to: " + itemScrollTop);
  $('#scrollArea').scrollTop(itemScrollTop)
}

/**
 * Switch to/open one of the tabs in the bottom pane. Current tabs: Test
 * Status, Module Progress, Verifications.
 * @param {Object} event - The event that fired.
 * @param {String} event.currentTarget.className - The class of the element
 * that triggered the event.
 * @param {String} tabName - The name of the tab associated with the
 * clicked element.
 */
function openTab(event, tabName) {
    // Declare all variables
    let i, tabcontent, tablinks;
    // Get all elements with class="tabcontent" and hide them
    tabcontent = document.getElementsByClassName("tabcontent");
    for (i = 0; i < tabcontent.length; i++) {
        tabcontent[i].style.display = "none";
    }
    // Get all elements with class="tablinks" and remove the class "active"
    tablinks = document.getElementsByClassName("tablinks");
    for (i = 0; i < tablinks.length; i++) {
        tablinks[i].className = tablinks[i].className.replace(" active", "");
    }
    // Show the current tab, and add an "active" class to the button that opened the tab
    document.getElementById(tabName).style.display = "block";
    event.currentTarget.className += " active";
}
