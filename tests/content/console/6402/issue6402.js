function runTest()
{
    FBTest.openNewTab(basePath + "console/6402/issue6402.html", function(wrappedWin)
    {
        FBTest.openFirebug(function()
        {
            var tasks = new FBTest.TaskList();
            var iframe = wrappedWin.document.querySelector("#iframe");

            // Note: do NOT reload at this moment.
            FBTest.enableConsolePanel();

            // Note: Test for the FW.Firebug.getConsoleByGlobal() function.
            var oriIframeConsoleInstance = FW.Firebug.getConsoleByGlobal(iframe.contentWindow);

            // Store the old console on the content window, so it doesn't get hueyfix'd away.
            wrappedWin.wrappedJSObject._origIframeConsole = oriIframeConsoleInstance;

            tasks.push(reloadIframe, iframe);

            tasks.push(testGetConsoleByGlobal, iframe, wrappedWin);

            tasks.wrapAndPush(checkConsole, wrappedWin, "false", "window._console should NOT refer to "+
                "the exposed Firebug console");

            tasks.push(FBTest.reload);

            tasks.wrapAndPush(checkConsole, wrappedWin, "true", "window._console should refer to the "+
                "exposed Firebug console");

            tasks.push(checkConsoleXMLPage);

            tasks.run(function()
            {
                FBTestFirebug.testDone("issue6402.DONE");
            });

        });
    });
}

function checkConsole(win, expectedResult, message)
{
    var $id = win.document.getElementById.bind(win.document);
    $id("check").click();
    FBTest.compare(expectedResult, $id("equals").textContent, message);
}

function checkConsoleXMLPage(callback)
{
    FBTest.openURL(basePath + "console/6402/issue6402.xml", function(win)
    {
        FBTest.executeCommandAndVerify(callback, "window.console.log('ok');", "ok",
            "div", "logRow-log");
    });
}

function reloadIframe(callback, iframe)
{
    iframe.addEventListener("load", function onload()
    {
        FBTest.progress("iframe reloaded");
        iframe.removeEventListener("load", onload);
        callback();
    });
    iframe.contentWindow.location.reload();
}

// Tests the value returned by Firebug.getConsoleByGlobal();
function testGetConsoleByGlobal(callback, iframe, wrappedWin)
{
    var oriIframeConsoleInstance = wrappedWin.wrappedJSObject._origIframeConsole;
    var newIframeConsoleInstance = FW.Firebug.getConsoleByGlobal(iframe.contentWindow);
    FBTest.ok(newIframeConsoleInstance, "newIframeConsoleInstance should be non-null");
    FBTest.ok(oriIframeConsoleInstance, "oriIframeConsoleInstance should be non-null");
    FBTest.compare(newIframeConsoleInstance, oriIframeConsoleInstance,
        "newIframeConsoleInstance should be different from oriIframeConsoleInstance", true);
    callback();
}
