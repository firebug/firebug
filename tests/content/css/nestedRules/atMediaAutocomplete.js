function runTest()
{
    FBTest.openNewTab(basePath + "css/nestedRules/atMediaAutocomplete.html", function(win)
    {
        FBTest.openFirebug(function()
        {
            var panel = FBTest.selectPanel("stylesheet");

            FBTest.selectPanelLocationByName(panel, "atMediaAutocomplete.html");

            // Check the number of displayed style rules
            var styleRules = panel.panelNode.querySelectorAll(".cssRule:not(.cssMediaRule)");
            FBTest.compare(3, styleRules.length, "Three style rules must be shown");

            // Check the number of displayed @media rules
            var atMediaRuleCount = 0;
            var printMediaRule = null;
            for (var i=0, len = styleRules.length; i<len; ++i)
            {
                var atMediaRule = FW.FBL.getAncestorByClass(styleRules[i], "cssMediaRule");
                if (atMediaRule)
                {
                    atMediaRuleCount++;
                    if (atMediaRule.getElementsByClassName("cssMediaRuleCondition").item(0).
                        textContent == "print")
                    {
                        printMediaRule = atMediaRule;
                    }
                }
            }

            FBTest.compare(2, atMediaRuleCount, "Two @media rules must be shown");

            // Try editing the '@media print' rule
            if (FBTest.ok(printMediaRule, "One of the rules must have a 'print' media type"))
            {
                var condition = printMediaRule.getElementsByClassName("cssMediaRuleCondition").item(0);

                // Click the media type of the rule to open the inline editor
                FBTest.synthesizeMouse(condition);

                var editor = panel.panelNode.getElementsByClassName("textEditorInner").item(0);
                if (FBTest.ok(editor, "Editor must be available now"))
                {
                    // Press 'Down' and verify display
                    FBTest.sendShortcut("VK_DOWN");
                    verifyDisplay(win, {
                        mediaType: "projection",
                        saveSuccessStyle: "rgba(0, 250, 0, 0.5) 0px 2px 6px 0px",
                        elementStyle:
                            "-moz-linear-gradient(135deg, rgb(120, 255, 140), rgb(180, 255, 200))"
                    });

                    // Enter 's' and verify display
                    FBTest.sendString("s", editor);
                    verifyDisplay(win, {
                        mediaType: "screen",
                        saveSuccessStyle: "rgba(0, 250, 0, 0.5) 0px 2px 6px 0px",
                        elementStyle:
                            "-moz-linear-gradient(135deg, rgb(120, 255, 140), rgb(180, 255, 200))"
                    });
                }

                FBTest.testDone();
            }
        });
    });
}

/**
 * Verifies the display of the media type, the save success and the element style
 * @param win {Window} Page window
 * @param expected {Object} Structure containing the expected 'mediaType', 'saveSuccessStyle'
 *     and 'elementStyle'
 */
function verifyDisplay(win, expected)
{
    var editor = FBTest.getSelectedPanel().panelNode.getElementsByClassName("textEditorInner").
        item(0);

    // Verify auto-completion
    FBTest.compare(expected.mediaType, editor.value, "Media type must be auto-completed");

    // Verify save success
    var inlineEditor = FW.FBL.getAncestorByClass(editor, "inlineEditor");
    var csInlineEditor = inlineEditor.ownerDocument.defaultView.getComputedStyle(inlineEditor);
    FBTest.compare(expected.saveSuccessStyle, csInlineEditor.boxShadow,
        "Inline editor must indicate save success");

    // Verify element display
    var element = win.document.getElementById("element");
    var csElement = win.getComputedStyle(element);
    FBTest.compare(expected.elementStyle, csElement.backgroundImage, "Element display must be correct");
}