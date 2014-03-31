/* See license.txt for terms of usage */

/**
 * This file defines Events APIs for test drivers.
 */

(function() {

// ********************************************************************************************* //
// Constants

// ********************************************************************************************* //
// Toolbar buttons

/**
 * Simulates click on the Continue button that is available in the Script panel when
 * Firebug is halted in the debugger. This action resumes the debugger (of course, the debugger
 * can stop at another breakpoint).
 * @param {Object} chrome Firebug.chrome object.
 */
this.clickContinueButton = function(chrome, callback)
{
    if (callback)
        DebuggerController.listenOnce(null, "onResumed", callback);
    this.clickToolbarButton(chrome, "fbContinueButton");
};

this.clickStepOverButton = function(chrome)
{
    this.clickToolbarButton(chrome, "fbStepOverButton");
};

this.clickStepIntoButton = function(chrome)
{
    this.clickToolbarButton(chrome, "fbStepIntoButton");
};

this.clickStepOutButton = function(chrome)
{
    this.clickToolbarButton(chrome, "fbStepOutButton");
};

this.clickRerunButton = function(chrome)
{
    this.clickToolbarButton(chrome, "fbRerunButton");
};

/**
 * Simulates click on the Break On Next button that is available in main Firebug toolbar.
 * The specific action (e.g. break on next XHR or break on next HTML mutation) depends
 * on the current panel.
 * @param {Object} chrome Firebug.chrome object.
 */
this.clickBreakOnNextButton = function(chrome, callback)
{
    if (!chrome)
        chrome = FW.Firebug.chrome;

    var doc = chrome.window.document;
    var button = doc.getElementById("fbBreakOnNextButton");
    var breakable = button.getAttribute("breakable");

    if (breakable == "true")
        FBTest.sysout("FBTestFirebug breakable true, click should arm break on next");
    else if (breakable == "false")
        FBTest.sysout("FBTestFirebug breakable false, click should disarm break on next");
    else
        FBTest.sysout("FBTestFirebug breakOnNext breakable:"+breakable, button);

    var panel = this.getSelectedPanel();
    if (!panel)
        throw new Error("Can't get the current panel");

    if (callback)
        DebuggerController.listenOnce(null, "breakOnNextUpdated", callback);

    // Do not use FBTest.click, toolbar buttons need to use sendMouseEvent.
    this.synthesizeMouse(button);
};

// ********************************************************************************************* //
// Debugger

/**
 * Registers handler for break in Debugger. The handler is called as soon as Firebug
 * breaks the JS execution on a breakpoint or due a <i>Break On Next<i> active feature.
 * @param {Object} chrome Current Firebug's chrome object (e.g. FW.Firebug.chrome)
 * @param {Number} lineNo Expected source line number where the break should happen.
 * @param {boolean} breakpoint Set to true if breakpoint should be displayed in the UI.
 * @param {Object} callback Handler that should be called when break happens.
 */
this.waitForBreakInDebugger = function(chrome, lineNo, breakpoint, callback)
{
    if (!chrome)
        chrome = FW.Firebug.chrome;

    FBTest.progress("waitForBreakInDebugger in chrome.window: " + chrome.window.location);

    // Get document of Firebug's panel.html
    var panel = chrome.getSelectedPanel();
    if (!panel)
    {
        FBTest.ok(panel, "Firebug needs a selected panel!");
        return;
    }

    var actor = FW.Firebug.DebuggerLib.getThreadActor(panel.context.browser);
    FBTest.sysout("waitForBreakInDebugger; actor: " + (actor ? actor._state : "no tab actor"));

    var doc = panel.panelNode.ownerDocument;

    // Complete attributes that must be set on sourceRow element.
    var attributes = {"class": "CodeMirror-debugLocation"};
    if (breakpoint)
        attributes["class"] += " CodeMirror-breakpoint";

    // Wait for the UI modification that shows the source line where break happened.
    var lookBP = new MutationRecognizer(doc.defaultView, "div", attributes);
    lookBP.onRecognizeAsync(function onBreak(sourceRow)
    {
        var panel = chrome.getSelectedPanel();
        if (panel)
        {
            setTimeout(function()
            {
                onPanelReady(sourceRow);
            }, 200);
            return;
        }

        FBTest.progress("onRecognizeAsync; wait for panel to be selected");

        // The script panel is not yet selected so wait for the 'selectingPanel' event.
        var panelBar1 = FW.FBL.$("fbPanelBar1", chrome.window.document);
        function onSelectingPanel()
        {
            panelBar1.removeEventListener("selectingPanel", onSelectingPanel, false);
            setTimeout(function()
            {
                onPanelReady(sourceRow);
            }, 200);
        }
        panelBar1.addEventListener("selectingPanel", onSelectingPanel, false);
    });

    function onPanelReady(sourceRow)
    {
        try
        {
            FBTest.progress("onRecognizeAsync; check source line number, exe_line" +
                (breakpoint ? " and breakpoint" : ""));

            var panel = chrome.getSelectedPanel();
            FBTest.compare("script", panel.name, "The script panel should be selected");

            var currentLineElt = sourceRow.querySelector(".CodeMirror-linenumber");
            var currentLineNo = parseInt(currentLineElt.textContent, 10);
            FBTest.compare(lineNo, currentLineNo, "The break must be on line " + lineNo + ".");

            callback(sourceRow);
        }
        catch (exc)
        {
            FBTest.exception("waitForBreakInDebugger", exc);
            FBTest.sysout("listenForBreakpoint callback FAILS "+exc, exc);
        }
    }

    FBTest.sysout("fbTestFirebug.waitForBreakInDebugger recognizing ", lookBP);
};

/**
 * Wait till the debugger is resumed.
 *
 * @param {Object} callback A callback executed when the debugger is resumed.
 */
this.waitForDebuggerResume = function(callback)
{
    var timeout = 250;
    var counter = 20;
    var chrome = FW.Firebug.chrome;

    function checkResumeState()
    {
        counter--;

        var stopped = chrome.getGlobalAttribute("fbDebuggerButtons", "stopped");
        if (stopped == "false" || counter <= 0)
            callback();
        else
            setTimeout(checkResumeState, timeout);
    }

    // Start checking state on timeout.
    setTimeout(checkResumeState, timeout);
};

// ********************************************************************************************* //
// Source

this.getSourceLineNode = function(lineNo, chrome)
{
    if (!chrome)
        chrome = FW.Firebug.chrome;

    var sourceLineNode;

    if (!isSourceLineVisible(lineNo))
        return;

    var panelNode = FBTest.getPanel("script").panelNode;
    var scroller = panelNode.getElementsByClassName("CodeMirror-scroll")[0];
    if (!scroller)
    {
        FBTest.sysout("getSourceLineNode; ERROR no scroller!");
        return;
    }

    var lines = scroller.getElementsByClassName("firebug-line");
    for (var i=0; i<lines.length; i++)
    {
        var line = lines[i].parentNode;
        var lineHeight = line.clientHeight;

        var lineNumberNode = line.getElementsByClassName("CodeMirror-linenumber")[0];
        if (!lineNumberNode)
            continue;

        var lineNumber = parseInt(lineNumberNode.textContent, 10);
        if (lineNumber == lineNo)
        {
            sourceLineNode = line;
            break;
        }
    }

    return sourceLineNode;
};

function isSourceLineVisible(lineNo)
{
    var scriptPanel = FBTest.getPanel("script");
    var editor = scriptPanel.scriptView.editor;
    if (!editor)
        return false;

    var editorObject = editor.editorObject;
    var view = scriptPanel.scriptView.editor.view;
    var scrollInfo = editorObject.getScrollInfo();
    var hScrollBar = view.getElementsByClassName("CodeMirror-hscrollbar")[0];

    var scrollInfo = editorObject.getScrollInfo();

    var pos = editor.cloneIntoCMScope({line: lineNo, ch: 0});
    var coords = editor.editorObject.charCoords(pos, "local");

    // Do not include h-scrollbar in editor height (even if CM docs says getScrollInfo
    // returns the visible area minus scrollbars, it doesn't seem to work).
    var editorHeight = scrollInfo.clientHeight - hScrollBar.offsetHeight;
    var top = coords.top;
    var bottom = coords.bottom;
    var lineHeight = editorObject.defaultTextHeight();

    // Scroll only if the target line is outside of the viewport.
    var scrollNeeded = (top <= scrollInfo.top || bottom >= (scrollInfo.top + editorHeight));
    return !scrollNeeded;
}

/**
 * Jump to a file@line.
 *
 * Example:
 *
 * ~~
 * FBTest.selectSourceLine(sourceFile.href, 1143, "js");
 * ~~
 */
// TODO: xxxpedro this function seems to be hacky
this.selectSourceLine = function(url, lineNo, category, chrome, callback)
{
    FBTest.sysout("selectSourceLine; " + url + ", lineNo: " + lineNo);

    if (!url)
    {
        var panel = FBTest.getSelectedPanel();
        url = panel.getObjectLocation(panel.location);
    }

    if (!url.startsWith("http"))
    {
        if (!FW.Firebug.currentContext)
        {
            FBTest.ok(FW.Firebug.currentContext, "There is a current context");
            throw "";
        }

        var docLocation = FW.Firebug.currentContext.window.location.href;
        url = new URL(url, docLocation).href;
    }

    var sourceLink = new FBTest.FirebugWindow.FBL.SourceLink(url, lineNo, category);
    if (chrome)
        chrome.select(sourceLink);
    else
        FBTest.FirebugWindow.Firebug.chrome.select(sourceLink);

    if (!callback)
        return;

    var tries = 50;
    var checking = setInterval(function checkScrolling()
    {
        var row = FBTest.getSourceLineNode(lineNo, chrome);
        if (!row && --tries)
            return;

        clearInterval(checking);

        if (!FBTest.ok(row, "Source line must exist " + url + ", " + lineNo))
            return;

        callback(row);
    }, 50);
};

this.getScriptPanelSelection = function()
{
    var panel = FBTest.getPanel("script");
    return panel.scriptView.getSelectedText();
}

this.unhighlightScriptPanelLine = function()
{
    var panel = FBTest.getPanel("script");
    return panel.scriptView.editor.unhighlightLine();
}

/**
 * Wait till a line in the Script panel is unhighlighted.
 *
 * @param {Function} callback Executed when a line is unhighlighted.
 */
this.waitForLineUnhighlight = function(callback)
{
    var browser = FBTest.getCurrentTabBrowser();

    var listener =
    {
        onLineUnhighlight: function(line, text)
        {
            DebuggerController.removeListener(browser, listener);

            callback(line + 1, text);
        }
    };

    DebuggerController.addListener(browser, listener);
}

/**
 * Wait till a line in the Script panel is highlighted.
 *
 * @param {Function} callback Executed when a line is highlighted.
 */
this.waitForLineHighlight = function(callback)
{
    var browser = FBTest.getCurrentTabBrowser();

    var listener =
    {
        onLineHighlight: function(line, text)
        {
            DebuggerController.removeListener(browser, listener);

            callback(line + 1, text);
        }
    };

    DebuggerController.addListener(browser, listener);
}

// ********************************************************************************************* //
// Context menu

this.showScriptPanelContextMenu = function(target, callback)
{
    var contextMenu = ContextMenuController.getContextMenu(target);

    function onPopupShown(event)
    {
        ContextMenuController.removeListener(target, "popupshown", onPopupShown);
        callback(contextMenu);
        contextMenu.hidePopup();
    }

    ContextMenuController.addListener(target, "popupshown", onPopupShown);

    var cm = FW.FBL.getAncestorByClass(target, "CodeMirror");
    var textArea = cm.getElementsByTagName("TEXTAREA").item(0);

    // xxxHonza: the way how clicking is done is a hack and it should be fixed.
    // 'mousedown' is sent so {@link SourceEditor} can handle it and remember
    // the currentTarget, see SourceEditor.onInit().
    // 'contextmenu' is sent so the {@link ScriptPanel} can handle it and show
    // the right context menu items. In this case CM's TEXTAREA must be the target
    // see ScriptPanel.getContextMenuItems().
    var eventDetails1 = {type: "mousedown", button: 2};
    FBTest.synthesizeMouse(target, 2, 2, eventDetails1);

    var eventDetails2 = {type: "contextmenu", button: 2};
    FBTest.synthesizeMouse(textArea, 2, 2, eventDetails2);
}

// ********************************************************************************************* //
// Local Helpers

FBTest.waitForThreadAttach = function(callback)
{
    if (!callback)
    {
        FBTest.sysout("waitForThreadAttach; ERROR no callback!");
        return;
    }

    var browser = FW.Firebug.currentContext.browser;
    var attached = FW.Firebug.DebuggerClient.isThreadAttached(browser);
    if (attached)
    {
        // The thread must be attached and also resumed. If the state isn't running
        // keep the 'attached' set to true and let the listener below wait for 'onResumed'
        var state = FW.Firebug.DebuggerClient.getThreadState(browser);
        if (state == "running")
        {
            callback();
            return;
        }
    }

    var listener =
    {
        onThreadAttached: function()
        {
            FBTest.sysout("waitForThreadAttach; On thread attached");

            attached = true;

            var actor = FW.Firebug.DebuggerLib.getThreadActor(browser);
            var tab = FW.Firebug.DebuggerClient.getTabClient(browser);
        },

        onResumed: function()
        {
            FBTest.sysout("waitForThreadAttach; On thread resumed");

            DebuggerController.removeListener(browser, listener);

            if (attached)
                callback();
        }
    };

    DebuggerController.addListener(browser, listener);
}

// ********************************************************************************************* //
// Stepping

this.stepOver = function(targetLine, callback)
{
    var chrome = FW.Firebug.chrome;

    FBTest.waitForBreakInDebugger(chrome, targetLine, false, callback);
    FBTest.clickStepOverButton(chrome);
}

this.stepOut = function(targetLine, callback)
{
    var chrome = FW.Firebug.chrome;

    FBTest.waitForBreakInDebugger(chrome, targetLine, false, callback);
    FBTest.clickStepOutButton(chrome);
}

this.stepInto = function(targetLine, callback)
{
    var chrome = FW.Firebug.chrome;

    FBTest.waitForBreakInDebugger(chrome, targetLine, false, callback);
    FBTest.clickStepIntoButton(chrome);
}

// ********************************************************************************************* //
}).apply(FBTest);
