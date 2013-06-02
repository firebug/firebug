function runTest()
{
    FBTest.sysout("issue6281.START");
    FBTest.openNewTab(basePath + "html/style/6281/issue6281.html", function(win)
    {
        var elementID = "textinput";
        FBTest.openFirebug();
        FBTest.selectPanel("html");

        // Search for 'placeholder' within the HTML panel
        FBTest.searchInHtmlPanel(elementID, function(sel)
        {
            FBTest.sysout("issue6281; selection:", sel);

            // Click on the element to make sure it's selected.
            var nodeLabelBox = FW.FBL.getAncestorByClass(sel.anchorNode, "nodeLabelBox");
            var nodeTag = nodeLabelBox.getElementsByClassName("nodeTag").item(0);
            FBTest.mouseDown(nodeTag);

            var sidePanel = FBTest.selectSidePanel("css");
            var rules = sidePanel.panelNode.getElementsByClassName("cssRule");

            var ruleExists = false;
            for (var i = 0; i < rules.length; i++)
            {
                var selector = rules[i].getElementsByClassName("cssSelector").item(0).textContent;
                if (selector == "#" + elementID + "::-moz-placeholder")
                {
                    FBTest.ok(true, "::-moz-placeholder pseudo-element rule exists");
                    ruleExists = true;
                    break;
                }
            }

            if (!ruleExists)
                FBTest.ok(false, "::-moz-placeholder pseudo-element rule does not exist");

            FBTest.testDone("issue6281.DONE");
        });
    });
}
