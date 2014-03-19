function runTest()
{
    FBTest.openNewTab(basePath + "net/4805/issue4805.html", function(win)
    {
        FBTest.openFirebug(function()
        {
            FBTest.enableNetPanel(function(win)
            {
                var panel = FBTest.selectPanel("net");
                var netPanelHeader = panel.panelNode.getElementsByClassName("netHeaderCell").item(0);
                FBTest.executeContextMenuCommand(netPanelHeader,
                    {label: FW.FBL.$STR("net.header.Protocol")}, function()
                {
                    panel.clear();

                    var options =
                    {
                        tagName: "tr",
                        classes: "netRow hasHeaders loaded",
                        counter: 2
                    };

                    FBTest.waitForDisplayedElement("net", options, function(row)
                    {
                        var panelNode = FBTest.selectPanel("net").panelNode;
                        var urls = panelNode.getElementsByClassName("netFullHrefLabel");
                        var protocols = panelNode.getElementsByClassName("netProtocolLabel");

                        for (var i=0; i<protocols.length; i++)
                            FBTest.compare(urls[i].textContent.replace(/^(.*?):.*/, "$1"), protocols[i].textContent, "The protocol of the "+(i+1)+". request must be correctly displayed");

                        FBTest.testDone();
                    });

                    FBTest.reload();
                });
            });
        });
    });
}
