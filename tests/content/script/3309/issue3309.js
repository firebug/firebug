function runTest()
{
    FBTest.sysout("issue3309.START");
    FBTest.setPref("filterSystemURLs", true);
    FBTest.progress("The filterSystemURLs Option is true for this test");

    FBTest.openNewTab(basePath + "script/3309/issue3309.html", function(win)
    {
        FBTest.openFirebug();

        // Enable script panel, but don't reload.
        var panelType = FW.Firebug.getPanelType("script");
        FW.Firebug.PanelActivation.setPanelState(panelType, true);

        var panelNode = FBTest.selectPanel("script").panelNode;

        // Check the content
        var header = panelNode.querySelector(".disabledPanelHead");
        if (FBTest.ok(header, "The header must be there"))
        {
            var text = FW.FBL.$STR("script.warning.inactive_during_page_load");
            FBTest.compare(text, header.textContent,
                "The page must display expected text: " + text);
        }

        FBTest.reload(function(win)
        {
            var panelNode = FBTest.selectPanel("script").panelNode;
            var header = panelNode.querySelector(".disabledPanelHead");
            if (FBTest.ok(header, "The header must be there"))
            {
                var text = FW.FBL.$STR("script.warning.no_javascript");
                FBTest.compare(text, header.textContent,
                    "The page must display expected text: " + text);
            }

            FBTest.testDone("issue3309.DONE");
        });
    });
}
