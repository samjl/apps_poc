let allMsgs = [];  // All messages as js objects
let activeMsgIndices = [];  // The current unfolded message indices
let activeHtml = []; // Currently active (unfolded) message HTML markup
let clusterize;

function formatTimestamp(rxTimestamp) {
  let date = new Date(rxTimestamp);
  let ts = [date.getUTCHours(), date.getUTCMinutes(), date.getUTCSeconds(), date.getUTCMilliseconds()];
  for (let x = 0;  x < ts.length; x++) {
    if (ts[x] < 10) {
      ts[x] = "0" + ts[x];
    }
  }
  return ts[0] + ":" + ts [1] + ":" + ts[2] + "." + ts[3];
}

function formatFolding(numOfChildren) {
  let display = {container: "", content: "", tooltip: ""};
  if (numOfChildren > 0) {
      if (userControls.foldAll == "on") {
        display.content = "+"
        display.tooltip = "Unfold higher level logs"
      } else {
        display.content = "-"
        display.tooltip = "Fold higher level logs"
      }
    } else {
      // Message is (currently) not a parent (has no children)
      display.container = "No";
    }
  return display
}

function getSpacerWidth(level, step) {
  if (level > 1 && step === 1) {
    return {
      levelChange: "block",
      spacerWidth: (level - 2) * 24
    };
  } else {
    return {
      levelChange: "none",
      spacerWidth: (level - 1) * 24
    };
  }
}

function getFoldState(level, parentIndices) {
  let folded = false;
  if (level > 1) {
    // Check global fold all state, this state can be overridden by the fold status of the parents
    if (userControls.foldAll == "on") {
      folded = true;
    }
    for (let i = 0; i < newMsg.level-1; i++) {
      // Check content of fold element of parent as soon as a parent is folded break out
      // Can't use getElementById because parent might not be in current (clusterize) cluster
      if (allMsgs[parentIndices[i] - 1].foldState) {
        folded = true;
        break;
      }
    }
  }
  return folded
}

function constructMessage(rxMsg) {
  return {
    // Received message params that do not change after being received
    message: utf8.encode(rxMsg.message),
    index: rxMsg.index,
    step: rxMsg.step,
    level: rxMsg.level,
    numOfChildren: rxMsg.numOfChildren,
    timestamp: formatTimestamp(rxMsg.timestamp),
    // Display parameters that can be modified by user input
    foldState: getFoldState(),
    foldDisplay: formatFolding(rxMsg.numOfChildren),
    indexClass: "index",
    levelDisplay: getSpacerWidth(rxMsg.level, rxMsg.step),
    // Debug
    parentIndices: rxMsg.parentIndices,
    _id: rxMsg._id.slice(-4),
    parents: rxMsg.parents.map(function(item) {
      // Used for debugging only - client side only uses the message indices above
      return item.slice(-4);
    }),
  };
}


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

function getDisplay(control) {
  if (control) {
    return "flex";
  } else {
    return "none";
  }
}

function updateActive() {
  // Reapply all global controls to template for every active (unfolded) message
  // Currently folded messages are updated with the global control state when they are unfolded (made active)
  activeHtml = [];  // Required for level filtering
  for (let i=0; i<activeMsgIndices.length; i++) {
    let allMsgsPosition = activeMsgIndices[i]-allMsgs[0].index;
    activeHtml[i] = getMarkup(allMsgs[allMsgsPosition]);
  }
  clusterize.update(activeHtml);
  clusterize.refresh(true);
}

$(window).ready(function(){
  // Set the height of the scroll area
  let contentHeight = document.getElementById("content").clientHeight;
  let scrollHeight = parseInt(contentHeight / 22) * 22;
  console.log("Content height: " + contentHeight + ", scroll height set to: " + scrollHeight);
  $("#scrollArea").css('max-height', scrollHeight + 'px');

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
      for (let i=allMsgsPosition+1; i<=allMsgsPosition+allMsgs[allMsgsPosition].numOfChildren; i++) {
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
      for (let i=activeIndex+1; i<=activeIndex+allMsgs[allMsgsPosition].numOfChildren; i++) {
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
    let socket = io();

    socket.on('connect', function() {
      console.log("Client connected");
      let vars = {};
      window.location.href.replace(/[?&]+([^=&]+)=([^&]*)/gi, function(m, key, value) {
        vars[key] = value;
      });
      socket.emit('from', {
        page: 'test',
        params: vars
      });
    });

    // Single (live db update) log message
    socket.on('log message', function(msg){
      // Check message is a new message - just log updates to console for now
      if (msg.o.hasOwnProperty("index") && msg.o.message.charAt(0) !== "{") {
        $('#main').append(applyTemplate(msg));
        newDomDiv = applyTemplate(msg);
        // console.log(newDomDiv)
        // allData.push(newDomDiv);
        // clusterize.update(allData);
      } else {
        // console.log(msg);
      }
      // window.scrollTo(0, document.body.scrollHeight);
    });
    // 1+ (already inserted) messages
    socket.on('saved messages', function(docs){
      // TODO check for duplicate messages
      console.log(docs.length + " messages received")
      docs.forEach(function(value) {
        let msg = constructMessage(value);
        allMsgs.push(msg);
        let msgMarkup = getMarkup(msg);
        activeHtml.push(msgMarkup);
        activeMsgIndices.push(msg.index);
      });

      clusterize.update(activeHtml);
      clusterize.refresh(true);  // refresh to update the row heights
      // refresh seems to fix the following issues:
      // not being able to scroll to bottom/flickering
      // skipping records when scrolling past cluster transitions
    });
    socket.on('html', function(html){
      clusterize.update(html);
    });
    socket.on('all verifications', function(allVerifications) {
      console.log(allVerifications);
      for (let i = 0, len = allVerifications.length; i < len; i++) {
        $('#verifications').append(getVerifyMarkup(allVerifications[i]));
      }
    });
    socket.on('verification', function(verification) {
      console.log(verification);
      $('#verifications').append(getVerifyMarkup(verification));
    });
  });
});

function setParentFolded(allMsgsIndex) {
  allMsgs[allMsgsIndex].foldState = true;
  allMsgs[allMsgsIndex].foldDisplay.content = "+";
  allMsgs[allMsgsIndex].foldDisplay.tooltip = "Unfold higher level logs";
}

function setParentUnfolded(allMsgsIndex) {
  allMsgs[allMsgsIndex].foldState = false;
  allMsgs[allMsgsIndex].foldDisplay.content = "-";
  allMsgs[allMsgsIndex].foldDisplay.tooltip = "Fold higher level logs";
}

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
  let previousClass;
  let previousTest;
  let lastRowClassData = $('#verifications tr:last td:eq(2)');
  let lastRowTestData = $('#verifications tr:last td:eq(3)');
  if (lastRowClassData[0]) {
    previousClass = lastRowClassData[0].innerText;
    previousTest = lastRowTestData[0].innerText;
  }
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
    <td style="max-width: 60px; width: 60px; padding: 0px; border: 0px">
      <input type="button" onclick="indexLinkClicked(${verifyData.indexMsg})" value="${verifyData.indexMsg}" 
      style="display: inline-block; position: relative; width:100%;  height: 100%;">
    </td>
  </tr>
  `;
}

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
        for (let i=allMsgsPosition+1; i<=allMsgsPosition+allMsgs[allMsgsPosition].numOfChildren; i++) {
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