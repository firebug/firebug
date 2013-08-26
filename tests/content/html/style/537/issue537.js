function runTest()
{
    FBTest.sysout("issue537.START");
    FBTest.openNewTab(basePath + "html/style/537/issue537.html", function(win)
    {
        FBTest.openFirebug();
        FBTest.selectPanel("html");

        // Search for 'element1' within the HTML panel
        FBTest.searchInHtmlPanel("element1", function(sel)
        {
            FBTest.sysout("issue537; selection:", sel);

            // Click on the element to make sure it's selected.
            var nodeLabelBox = FW.FBL.getAncestorByClass(sel.anchorNode, "nodeLabelBox");
            var nodeTag = nodeLabelBox.querySelector(".nodeTag");
            FBTest.mouseDown(nodeTag);

            var sidePanel = FBTest.selectSidePanel("css");
            var rules = sidePanel.panelNode.querySelectorAll(".cssRule");
            var pseudoElementRules = [];

            for (var i=0; i<rules.length; i++)
            {
                var selector = rules[i].querySelector(".cssSelector").innerHTML;
                if (isPseudoElementSelector(selector))
                    pseudoElementRules.push(rules[i]);
            }
            // Four pseudo-element rules must be shown inside the Style side panel
            FBTest.compare(4, pseudoElementRules.length, "There must be four pseudo-element rules.");

            for (var i=0; i<pseudoElementRules.length; i++)
            {
                var selector = pseudoElementRules[i].querySelector(".cssSelector").innerHTML;
                if (selector == "#element1:before" || selector == "#element1:after")
                {
                    var propNames = pseudoElementRules[i].querySelectorAll(".cssPropName");
                    // :before and :after must have a property 'content'
                    var containsContent = false;
                    for (var j=0; j<propNames.length; j++)
                    {
                        if (propNames[j].innerHTML == "content")
                        {
                            containsContent = true;
                            break;
                        }
                    }
                    FBTest.ok(containsContent, "'" + selector + "' must contain a property 'content'");
                }
            }
            FBTest.testDone("issue537.DONE");
        });
    });
}

function isPseudoElementSelector(selector) {
    const pseudoElements = [":first-letter", ":first-line", ":before", ":after"];

    for(var i=0; i<pseudoElements.length; i++)
    {
        if (selector.indexOf(pseudoElements[i]) != -1)
            return true;
    }

    return false;
}