function runTest()
{
    FBTest.sysout("cookiesPanel.START");

    FBTest.openNewTab(basePath + "cookies/general/cookiesPanel.html", function(win)
    {
        FBTest.openFirebug(true);
        FBTestFireCookie.enableCookiePanel(function(win) 
        {
            FBTest.sysout("cookiesPanel; Check existence of the Cookies panel.");

            // Make sure the Cookie panel's UI is there.
            var panel = FBTest.selectPanel("cookies");

            if (!panel)
            {
                var context = FW.Firebug.currentContext;
                FBTest.progress("Current context " + context.getName());
                if (context)
                {
                    var names = [];
                    var panelTypes = FW.Firebug.getMainPanelTypes(context);
                    for (var i=0; i<panelTypes.length; i++)
                        names.push(FW.Firebug.getPanelTitle(panelTypes[i]));
                    FBTest.progress("Panels " + names.join(","));
                }
            }
            else
            {
                FBTest.ok(panel.panelNode, "Cookies panel must be initialized.");
            }

            // Finish test
            FBTest.testDone("cookiesPanel.DONE");
        });
    });
};
