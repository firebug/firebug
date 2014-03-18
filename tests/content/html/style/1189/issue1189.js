function runTest()
{
    FBTest.openNewTab(basePath + "html/style/1189/issue1189.html", function(win)
    {
        FBTest.openFirebug(function()
        {
            var panel = FBTest.selectPanel("css");

            var tests = [];
            tests.push(function(callback)
            {
                shorthandPropOverwritesShorthandProp(panel, callback);
            });

            tests.push(function(callback)
            {
                shorthandPropOverwritesSingleValueProp(panel, callback);
            });

            FBTestFirebug.runTestSuite(tests, function()
            {
                FBTest.testDone();
            });
        });
    });
}


function shorthandPropOverwritesShorthandProp(panel, callback)
{
    checkProp(panel, "div1", "#div1", "border-top", callback);
}

function shorthandPropOverwritesSingleValueProp(panel, callback)
{
    checkProp(panel, "div2", "#div1 div", "border-right-width", callback);
}

//************************************************************************************************

function checkProp(panel, element, checkedSelector, checkedPropName, callback)
{
    FBTest.selectElementInHtmlPanel(element, function(node)
    {
        var rules = panel.panelNode.getElementsByClassName("cssRule");
        for (var j=0; j<rules.length; j++)
        {
            var rule = rules[j];
            var selector = rule.getElementsByClassName("cssSelector").item(0).textContent;
            if (selector == checkedSelector)
            {
                var props = rule.getElementsByClassName("cssProp");
                for (var i=0; i<props.length; i++)
                {
                    var prop = props[i];
                    var propName = prop.getElementsByClassName("cssPropName").item(0).
                        textContent;

                    if (propName == checkedPropName)
                    {
                        FBTest.ok(FW.FBL.hasClass(prop, "cssOverridden"),
                            "'"+checkedPropName+"' style must be marked as overwritten");
                        break;
                    }
                }
                break;
            }
        }
        callback();
    });
}
