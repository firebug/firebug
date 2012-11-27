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
                    var nodeTag = requestInfo.getElementsByClassName("netInfoXMLText")[0].
                        getElementsByClassName("nodeTag")[2];

                    if (FBTest.ok(nodeTag && nodeTag.textContent == "node", "There must be a <node> tag."))
                    {
                        FBTest.mouseOver(nodeTag);
                        var tooltip = FW.FBL.$("fbTooltip");
                        FBTest.compare("/root/node", tooltip.label, "The tooltip of the <node> tag must be correct.");
                        FBTest.testDone("issue5742.DONE");
                    }
                }
            });

            FBTest.click(win.document.getElementById("makeXHR"));
        });
    });
}
