function runTest()
{
    FBTest.openNewTab(basePath + "css/nestedRules/atMediaStyleEditing.html", function(win)
    {
        FBTest.openFirebug(function()
        {
            var panel = FBTest.selectPanel("stylesheet");

            FBTest.selectPanelLocationByName(panel, "atMediaStyleEditing.html");

            // Check the number of displayed style rules
            var styleRules = panel.panelNode.querySelectorAll(".cssRule:not(.cssMediaRule)");
            FBTest.compare(3, styleRules.length, "Three style rules must be shown");

            // Check the number of displayed @media rules
            var atMediaRuleCount = 0;
            var allMediaRule = null;
            for (var i=0, len = styleRules.length; i<len; ++i)
            {
                var atMediaRule = FW.FBL.getAncestorByClass(styleRules[i], "cssMediaRule");
                if (atMediaRule)
                {
                    atMediaRuleCount++;
                    if (atMediaRule.getElementsByClassName("cssMediaRuleCondition").item(0).
                        textContent == "all")
                    {
                        allMediaRule = atMediaRule;
                    }
                }
            }

            FBTest.compare(2, atMediaRuleCount, "Two @media rules must be shown");

            // Try manipulating the properties inside the '@media all' rule
            if (FBTest.ok(allMediaRule, "One of the rules must have a 'all' media type"))
            {
                var propValue = allMediaRule.getElementsByClassName("cssPropValue").item(0);

                // Click the value of the 'background-image' property inside the '#element' rule
                FBTest.synthesizeMouse(propValue);

                var editor = panel.panelNode.getElementsByClassName("textEditorInner").item(0);
                if (FBTest.ok(editor, "Editor must be available now"))
                {
                    // Enter '-moz-linear-gradient(135deg, #ff788c, #ffb4c8)' and verify display
                    FBTest.sendString("-moz-linear-gradient(135deg, #ff8c78, #ffc8b4)", editor);
                    var element = win.document.getElementById("element");
                    var csElement = win.getComputedStyle(element);

                    // Wait a bit until the new style gets applied
                    setTimeout(function()
                    {
                        FBTest.compare(
                            "-moz-linear-gradient(135deg, rgb(255, 140, 120), rgb(255, 200, 180))",
                            csElement.backgroundImage, "Element display must be correct");

                        // Click outside the CSS property value to stop inline editing
                        FBTest.synthesizeMouse(panel.panelNode, 300, 0);

                        var prop = FW.FBL.getAncestorByClass(propValue, "cssProp");

                        // Click the value of the 'background-image' property inside the '#element' rule
                        FBTest.synthesizeMouse(prop, 2, 2);

                        // Verify the element display
                        FBTest.compare(
                            "-moz-linear-gradient(135deg, rgb(120, 140, 255), rgb(180, 200, 255))",
                            csElement.backgroundImage, "Element display must be correct");

                        FBTest.testDone();
                    }, 500);
                }
            }
        });
    });
}
