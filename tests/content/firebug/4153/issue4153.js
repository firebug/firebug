function runTest()
{
    FBTest.openNewTab(basePath + "firebug/4153/issue4153.html", function (win)
    {
        detachFirebug(function (win)
        {
            FBTest.ok(FBTest.isDetached(), "Firebug must be detached now.");
            deactiveFirebug(function ()
            {
                FBTest.ok(isDeactive(), "Firebug must be deactivated now.");
                toggleDetachBar(function ()
                {
                    FBTest.ok(!(FBTest.isDetached() && isDeactive()),
                        "Firebug must be activated and also attached to the main window now.");
                    FBTest.testDone();
                });
            });
        });
    });
}

function detachFirebug(callback)
{
    FBTest.detachFirebug(function(detachedWindow)
    {
        if (FBTest.ok(detachedWindow, "Firebug is detaching ....."))
        {
            FBTest.OneShotHandler(detachedWindow, "load", function (event)
            {
                FBTest.progress("Firebug detached in a new window.");
                setTimeout(function ()
                {
                    callback(detachedWindow);
                });
            });
        }
    });
}

function toggleDetachBar(callback)
{
    FW.Firebug.toggleDetachBar(false, true);
    if (FBTest.ok(!FBTest.isDetached(), "Firebug is attached to the main window."))
    {
        setTimeout(function ()
        {
            callback();
        });
    }
    else
    {
        FBTest.testDone();
        return;
    }
}

function deactiveFirebug(callback)
{
    FW.Firebug.closeFirebug(true);
    if (FBTest.ok(isDeactive(), "Firebug is deactivated now."))
    {
        setTimeout(function ()
        {
            callback();
        });
    }
    else
    {
        FBTest.testDone();
        return;
    }
}

function isDeactive()
{
    return !FW.Firebug.currentContext;
}