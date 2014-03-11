function runTest()
{
    FBTest.openNewTab(basePath + "html/4675/issue4675.html", function(win)
    {
        // 1. Open Firebug
        FBTest.openFirebug(() =>
        {

            // 2. Switch to the HTML panel
            var panel = FBTest.selectPanel("html");

            var element = FW.Firebug.currentContext.window.document.getElementsByTagName("html")[0];
            panel.select(element);
            var nodeBox = panel.panelNode.getElementsByClassName("nodeBox selected")[0];

            // 3. Right-click the &lt;html&gt; tag and choose 'Expand/Contract All' from the
            //    context menu
            FBTest.executeContextMenuCommand(nodeBox, "fbExpandContractAll", () =>
            {
                    var nodes = panel.panelNode.querySelectorAll(
                        ".nodeBox.containerNodeBox:not(.docTypeNodeBox):not(.open) .nodeLabel " +
                        ".nodeTag");
                    FBTest.compare(3, nodes.length, "There must be 3 collapsed nodes");
                    for (var i = 0; i < nodes.length; i++)
                    {
                        FBTest.compare(/^script|style|link$/, nodes[i].textContent,
                            "Node must be a <script>, <style> or <link>");
                    }
                    FBTest.testDone();
            });
        });
    });
}
