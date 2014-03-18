function runTest()
{
    FBTest.openNewTab(basePath + "html/4669/issue4669.xml", function(win)
    {
        FBTest.openFirebug(function()
        {
            var panel = FBTest.selectPanel("html");
            FBTest.selectElementInHtmlPanel(win.document.documentElement, function(node)
            {
                // Press '*' twice and verify, that all tags are expanded afterwards
                FBTest.sendChar("*", panel.panelNode);
                FBTest.sendChar("*", panel.panelNode);
                var notExpandedNodes = panel.panelNode.querySelectorAll(".containerNodeBox:not(.open)");
                FBTest.ok(notExpandedNodes.length == 0, "All nodes must be expanded");

                FBTest.testDone();
            });
        });
    });
}