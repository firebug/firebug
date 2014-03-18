function runTest()
{
    FBTest.openNewTab(basePath + "firebug/5526/issue5526.html", function(win)
    {
        detachFirebug(function(win)
        {
            FBTest.ok(FBTest.isDetached(), "Firebug must be detached now");
            attachFirebug(function()
            {
                FBTest.progress("waiting for detach " + FW.Firebug.chrome.waitingForDetach);
                FBTest.ok(FBTest.isMinimized(), "Firebug must be minimized now");

                openFirebug(function()
                {
                    FBTest.ok(FBTest.isDetached(), "Firebug must be detached now");
                    FBTest.testDone();
                });
            })
        });
    });
}

// xxxHonza: if this method is generic enough it
// should be moved into FBTest namespace so, other tests
// can reuse it (and it should probably replace the current
// FBTest.detachFirebug API)
function detachFirebug(callback)
{
    FBTest.detachFirebug(function(detachedWindow)
    {
        if (FBTest.ok(detachedWindow, "Firebug is detaching..."))
        {
            FBTest.OneShotHandler(detachedWindow, "load", function(event)
            {
                FBTest.progress("Firebug detached in a new window.");
                setTimeout(function()
                {
                    callback(detachedWindow);
                });
            });
        }
    });
}

function openFirebug(callback)
{
    FBTest.sendKey("F12");

    // This time out is wrong, we need to get detached window,
    // register onload event one shot handler and wait till the window
    // is loaded. Just like the detachFirebug method does.
    setTimeout(function()
    {
        callback();
    }, 1000);
}

function attachFirebug(callback)
{
    // Attaching Firebug is synchronous?
    FBTest.sendKey("F12");
    callback();
}

// xxxHonza: already in FBTest will be part of FBTest 1.10b6
function isMinimized()
{
    return FW.Firebug.isMinimized();
}

