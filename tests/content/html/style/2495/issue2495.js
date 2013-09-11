function runTest()
{
    FBTest.sysout("issue2495.START");
    FBTest.openNewTab(basePath + "html/style/2495/issue2495.html", function(win)
    {
        var elementID = "element";
        FBTest.openFirebug();
        FBTest.selectPanel("html");

        // Search for 'placeholder' within the HTML panel
        FBTest.searchInHtmlPanel(elementID, function(sel)
        {
            FBTest.sysout("issue2495; selection:", sel);

            // Click on the element to make sure it's selected.
            var nodeLabelBox = FW.FBL.getAncestorByClass(sel.anchorNode, "nodeLabelBox");
            var nodeTag = nodeLabelBox.getElementsByClassName("nodeTag").item(0);
            FBTest.mouseDown(nodeTag);

            var sidePanel = FBTest.selectSidePanel("css");
            var rules = sidePanel.panelNode.getElementsByClassName("cssRule");

            var elementRule = null;
            for (var i=0, len=rules.length; i<len; ++i)
            {
                var selector = rules[i].getElementsByClassName("cssSelector").item(0).textContent;
                if (selector == "#" + elementID)
                {
                    FBTest.ok(true, "'#element' rule exists");
                    elementRule = rules[i];
                    break;
                }
            }

            if (elementRule)
            {
                var props = elementRule.getElementsByClassName("cssProp");
                for (var i=0, len=props.length; i<len; ++i)
                {
                    var propName = props[i].getElementsByClassName("cssPropName").item(0).
                        textContent;
                    if (propName == "font-family")
                    {
                        var usedPropValues = props[i].getElementsByClassName("cssPropValueUsed");
                        if (FBTest.compare(1, usedPropValues.length,
                                "There must be one used font"))
                        {
                            FBTest.compare("sans-serif", usedPropValues[0].textContent,
                                "The used font must be 'sans-serif'");
                        }

                        var unusedPropValues = props[i].getElementsByClassName("cssPropValueUnused");
                        if (FBTest.compare(2, unusedPropValues.length,
                                "There must be two unused fonts"))
                        {
                            FBTest.compare("nofont1", unusedPropValues[0].textContent,
                                "The first unused font must be 'nofont1'");
                            FBTest.compare("nofont2", unusedPropValues[1].textContent,
                                "The second unused font must be 'nofont2'");
                        }
                    }
                }
            }
            else
            {
                FBTest.ok(false, "'#element' rule does not exist");
            }

            FBTest.testDone("issue2495.DONE");
        });
    });
}
