function runTest()
{
    FBTest.openNewTab(basePath + "memory/memoryLeak/memory.html", function(win)
    {
        FBTest.openFirebug(function()
        {
            // Define individual async tasks.
            var tasks = new FBTest.TaskList();
            for (var i=0; i<14; i++)
                tasks.push(openPopup, win);

            // Run them all.
            tasks.run(function()
            {
                FBTest.testDone();
            });
        });
    });
}

function openPopup(callback, win)
{
    function onPopupLoaded()
    {
        FBTest.progress("Great, the popup is loaded");
        win.document.removeEventListener("popup-loaded", onPopupLoaded, true);

        setTimeout(function()
        {
            var popup = win.wrappedJSObject.popup;
            delete win.wrappedJSObject.popup;
            popup.close();
            FBTest.progress("The popup should be closed now");
            callback();
        }, 200);
    };

    win.document.addEventListener("popup-loaded", onPopupLoaded, true);
    FBTest.click(win.document.getElementById("openPopup"));
}
