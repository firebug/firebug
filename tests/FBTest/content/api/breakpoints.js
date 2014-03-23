/* See license.txt for terms of usage */

/**
 * This file defines Breakpoints API for test drivers.
 */

(function() {

// ********************************************************************************************* //
// Breakpoints API

/**
 * Set a breakpoint
 * @param {Object} chrome Firebug chrome object. If null, the default is used.
 * @param {Object} url URL of the target file. If null, the current file is used.
 * @param {Object} lineNo Source line number.
 * @param {Object} attributes Additional breakpoint attributes
 * @param {Object} callback Asynchronous callback is called as soon as the breakpoint is set.
 */
this.setBreakpoint = function(chrome, url, lineNo, attributes, callback)
{
    // FIXME: xxxpedro Test case for Issue 4553 is failing sometimes and it seems
    // to be something inside this FBTest.setBreakpoint() function
    if (!chrome)
        chrome = FW.Firebug.chrome;

    var panel = FBTest.selectPanel("script");
    if (!url)
        url = panel.getObjectLocation(panel.location);

    FBTest.sysout("setBreakpoint; " + url + ", " + lineNo);

    // FIXME: xxxpedro this function seems to be hacky, and could be the source
    // of the problem with the test case for Issue 4553
    FBTest.selectSourceLine(url, lineNo, "js", chrome, function(row)
    {
        var hasBreakpoint = FBTest.hasBreakpoint(lineNo);
        FBTest.ok(!hasBreakpoint, "There must not be a breakpoint at line: " + lineNo);

        FBTest.sysout("setBreakpoint; source line selected", row);

        if (false && attributes && attributes.condition)
        {
            // Right click on the target element.
            var eventDetails = {type: "mousedown", button: 2};
            FBTest.synthesizeMouse(target, 2, 2, eventDetails);

            var editor = panel.panelNode.querySelector(".conditionEditor .completionInput");
            FBTest.ok(editor, "Editor must exist");

            // xxxHonza: TODO
        }
        else
        {
            var config = {tagName: "div", classes: "breakpoint"};
            FBTest.waitForDisplayedElement("script", config, function(element)
            {
                FBTest.sysout("setBreakpoint; breakpoint created");

                // The source view may have been rebuilt, refetch the row.
                var row = FBTest.getSourceLineNode(lineNo, chrome);
                callback(row);
            });

            var target = row.querySelector(".CodeMirror-linenumber");

            // Note: Don't synthesize a mousedown event: this would make
            // console/breakOnError/breakOnError fail in timeout (see issue 7267).
            FBTest.synthesizeMouse(target, 2, 2);
            target = null;
        }
    });
};

/**
 * Wait till specific breakpoint is set (response from the backend received)
 *
 * @param {String} url URL of the breakpoint we are waiting for.
 * @param {Number} lineNo Line number where the breakpoint should be set.
 * @param {Function} callback Executed when the breakpoint is set.
 */
this.waitForBreakpoint = function(url, lineNo, callback)
{
    var browser = FBTest.getCurrentTabBrowser();

    var listener =
    {
        onBreakpointAdded: function(bp)
        {
            if (bp.lineNo+1 != lineNo || bp.href != url)
                return;

            DebuggerController.removeListener(browser, listener);

            callback();
        }
    };

    DebuggerController.addListener(browser, listener);
};

this.removeBreakpoint = function(chrome, url, lineNo, callback)
{
    if (!callback)
    {
        FBTest.sysout("removeBreakpoint; ERROR missing callback");
        return;
    }

    if (!chrome)
        chrome = FW.Firebug.chrome;

    var panel = FBTestFirebug.selectPanel("script");
    if (!url)
        url = panel.getObjectLocation(panel.location);

    FBTestFirebug.selectSourceLine(url, lineNo, "js", chrome, function(row)
    {
        var hasBreakpoint = FBTest.hasBreakpoint(lineNo);
        FBTest.ok(hasBreakpoint, "There must be a breakpoint at line: " + lineNo);

        var browser = FBTestFirebug.getCurrentTabBrowser();
        DebuggerController.listenOnce(browser, "onBreakpointRemoved", function()
        {
            hasBreakpoint = FBTest.hasBreakpoint(lineNo);
            FBTest.ok(!hasBreakpoint, "Breakpoint must be removed");

            callback();
        });

        // Click to remove a breakpoint.
        var target = row.querySelector(".CodeMirror-linenumber");

        // Note: Don't synthesize a mousedown event: this would make
        // console/breakOnError/breakOnError fail in timeout (see issue 7267).
        FBTest.synthesizeMouse(target, 2, 2);
    });
};

this.hasBreakpoint = function(line, chrome)
{
    if (typeof(line) == "number")
        line = FBTest.getSourceLineNode(line, chrome);

    if (!line)
    {
        FBTrace.sysout("hasBreakpoint ERROR undefined line");
        return false;
    }

    var bpNode = line.getElementsByClassName("breakpoint");
    return (bpNode.length > 0);
};

this.waitForDisplayedBreakpoint = function(chrome, url, lineNo, callback)
{
    FBTest.selectSourceLine(url, lineNo, "js", chrome, function(row)
    {
        var config = {tagName: "div", classes: "breakpoint"};
        FBTest.waitForDisplayedElement("script", config, function(element)
        {
            callback(row);
        });
    });
};

this.removeAllBreakpoints = function(callback)
{
    FW.Firebug.Debugger.clearAllBreakpoints(null, callback);
};

// ********************************************************************************************* //
}).apply(FBTest);
