function runTest()
{
    FBTest.sysout("issue5742.START");

    FBTest.openNewTab(basePath + "net/5742/issue5742.html", function(win)
    {
        FBTest.openFirebug();
        FBTest.enableNetPanel(function(win)
        {
            FBTest.clearCache();

            var config = {
                tagName: "tr",
                classes: "netRow category-xhr hasHeaders loaded"
            };

            FBTest.waitForDisplayedElement("net", config, function(row)
            {
                FBTest.click(row);
                var requestInfo = row.nextSibling;
                var XMLTab = requestInfo.getElementsByClassName("netInfoXMLTab")[0];

                if (FBTest.ok(XMLTab, "There must be an XML tab."))
                {
                    FBTest.click(XMLTab);

                    var root = requestInfo.getElementsByClassName("netInfoXMLText")[0];
                    var nodeTag = root.getElementsByClassName("nodeTag")[1];

                    if (FBTest.ok(nodeTag && nodeTag.textContent ==
                        "node", "There must be a <node> tag."))
                    {
                        FBTest.showTooltip(nodeTag, function(tooltip)
                        {
                            FBTest.compare("/root/node", tooltip.label,
                                "The tooltip of the <node> tag must be correct.");
                            FBTest.testDone("issue5742.DONE");
                        });
                    }
                }
            });

            FBTest.click(win.document.getElementById("makeXHR"));
        });
    });
}
