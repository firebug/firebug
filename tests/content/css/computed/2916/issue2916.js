function runTest()
{
    FBTest.openNewTab(basePath + "css/computed/2916/issue2916.html", function(win)
    {
        FBTest.openFirebug(function()
        {
            var panel = FBTest.selectPanel("computed");

            FBTest.selectElementInHtmlPanel("element", function(win)
            {
                var panelNode = panel.panelNode;
                var headers = panelNode.getElementsByClassName("cssComputedHeader");

                // Check whether the 'Text' category exists
                var textCategoryName = FW.FBL.$STR("StyleGroup-text");
                var textCategory = null;
                for (i=0, len=headers.length; i<len && !textCategory; ++i)
                {
                    if (headers[i].textContent == textCategoryName)
                        textCategory = headers[i];
                }

                if (FBTest.ok(textCategory, "'" + textCategoryName + "' category must exist"))
                {
                    // Check whether the 'font-family' property exists
                    var group = FW.FBL.getAncestorByClass(textCategory, "computedStylesGroup");
                    var props = group.getElementsByClassName("computedStyleRow");
                    var fontFamilyProp = null;
                    for (var i=0, len=props.length; i<len && !fontFamilyProp; ++i)
                    {
                        if (props[i].getElementsByClassName("stylePropName")[0].
                            textContent == "font-family")
                        {
                            fontFamilyProp = props[i];
                        }
                    }

                    if (FBTest.ok(fontFamilyProp, "'font-family' property must exist"))
                    {
                        FBTest.click(fontFamilyProp);
                        FBTest.ok(FW.FBL.hasClass(fontFamilyProp, "opened"),
                            "'font-family' property must be expandable");

                        var matchedSelectors = fontFamilyProp.nextSibling.
                            getElementsByClassName("computedStyleRow");

                        if (FBTest.compare(3, matchedSelectors.length,
                            "'font-family' property must have three trace styles"))
                        {
                            checkMatchedSelector(
                            {
                                text: new RegExp("#content > div\\\s*Arial,\u200bsans-serif\\\s*" +
                                    "issue2916\\\.html\\\s+\\\(.*?8\\\)"),
                                type: "cssBestMatch"
                            }, matchedSelectors[0], "First");
                            checkMatchedSelector(
                            {
                                text: new RegExp("#element\\\s*monospace\\\s*issue2916\\\.html\\\s+" +
                                    "\\\(.*?12\\\)"),
                                type: "cssOverridden"
                            }, matchedSelectors[1], "Second");
                            checkMatchedSelector(
                            {
                                text: new RegExp("body\\\s*\\\"Trebuchet MS\\\"," +
                                    "\u200bHelvetica,\u200bsans-serif\\\s*testcase\\\.css\\\s+\\\(.*?19\\\)"),
                                type: "cssParentMatch"
                            }, matchedSelectors[2], "Third");
                        }
                    }
                }

                FBTest.testDone();
            });
        });
    });
}

function checkMatchedSelector(expected, style, styleNumber)
{
    FBTest.compare(expected.text, style.textContent, styleNumber +
        " trace style data must be correct");
    FBTest.compare(new RegExp(expected.type), style.className,
        styleNumber + " trace style display must be correct");
}
