function runTest()
{
    FBTest.openNewTab(basePath + "html/style/5438/issue5438.html", function(win)
    {
        FBTest.openFirebug(function()
        {
            FBTest.selectPanel("html");
            FBTest.selectElementInHtmlPanel("element", function(node)
            {
                var panel = FBTest.selectSidePanel("css");
                var values = panel.panelNode.getElementsByClassName("cssPropValue");

                for (var i = 0; i < values.length; ++i)
                {
                    if (values[i].textContent == "TestFont")
                    {
                        FBTest.executeContextMenuCommand(values[i], "fbInspectDeclaration", function()
                        {
                            // Firebug should switch to the CSS panel.
                            var panel = FBTest.getSelectedPanel();
                            if (FBTest.compare("stylesheet", panel.name, "The CSS panel must be selected"))
                            {
                                var highlightedRule = panel.panelNode.
                                    getElementsByClassName("jumpHighlight").item(0);
                                if (FBTest.ok(highlightedRule, "A rule must be highlighted"))
                                {
                                    FBTest.compare(new RegExp("@font-face\\s+\\{[\\r\\n\\s]+"+
                                        "font-family:\\s+\"TestFont\";[\\r\\n\\s]+src:\\s+"+
                                        "url\\(\"testFont\.woff\"\\)\\s+format\\(\"woff\"\\);"+
                                        "[\\r\\n\\s]*\\}"), highlightedRule.textContent,
                                        "The rule must be the correct @font-face definition");
                                }
                            }

                            FBTest.testDone();
                        });
                        break;
                    }
                }
            });
        });
    });
}
