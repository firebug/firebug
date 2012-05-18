function runTest()
{
    FBTest.sysout("issue5451.START");

    FBTest.openNewTab(basePath + "css/computed/5451/issue5451.html", function(win)
    {
        FBTest.openFirebug();
        FBTest.selectPanel("html");

        var panel = FBTest.selectSidePanel("computed");
        panel.panelNode.scrollTop = 100;

        FBTest.reload(function() {
            var panel = FBTest.selectSidePanel("computed");
            FBTest.compare(100, panel.panelNode.scrollTop, "Panel must be scrolled down 100 pixels");

            FBTest.testDone("issue5451.DONE");
        });
    });
}
