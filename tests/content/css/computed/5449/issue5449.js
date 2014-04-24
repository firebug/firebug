const infoTipTypes = {
    "color": {class: "infoTipColorBox", prop: "backgroundColor"},
    "gradient": {class: "infoTipColorBox", prop: "backgroundImage"},
    "image": {class: "infoTipImageBox", prop: "backgroundImage"},
    "fontFamily": {class: "infoTipFontFamilyBox", prop: "fontFamily"}
}

function runTest()
{
    FBTest.openNewTab(basePath + "css/computed/5449/issue5449.html", function(win)
    {
        FBTest.openFirebug(function()
        {
            FBTest.setSidePanelWidth(520);
            FBTest.selectPanel("html");

            FBTest.selectElementInHtmlPanel("element", function(node)
            {
                var tests = [];
                tests.push(fontFamily);
                tests.push(color);
                tests.push(gradient);
                tests.push(image);

                FBTest.runTestSuite(tests, function()
                {
                    FBTest.testDone();
                });
            });
        });
    });
}

function fontFamily(callback)
{
    executeStylePropTest("font-family", "fontFamily", /Arial/, callback);
}

function color(callback)
{
    executeStylePropTest("background-color", "color", /rgb\(140, 140, 255\)/, callback);
}

function gradient(callback)
{
    executeMatchedSelectorTest("background-image", "gradient",
        /-moz-linear-gradient\(135deg,\s*#788cff,\s*#b4c8ff\)/,
        0, callback);
}

function image(callback)
{
    executeMatchedSelectorTest("background-image", "image",
        new RegExp(basePath+"css\/computed\/5449\/firebug.png"), 1, callback);
}

//************************************************************************************************

function executeStylePropTest(propName, type, expectedValue, callback)
{
    var panel = FBTest.selectSidePanel("computed");
    var propNames = panel.panelNode.getElementsByClassName("stylePropName");

    for (var i = 0; i < propNames.length; ++i)
    {
        if (propNames[i].textContent == propName)
        {
            var style = FW.FBL.getAncestorByClass(propNames[i], "computedStyle");
            var propValue = style.getElementsByClassName("stylePropValue").item(0);

            var config = {tagName: "div", classes: infoTipTypes[type].class};
            FBTest.waitForDisplayedElement("computed", config, function (infoTip)
            {
                var infoTipActive = infoTip.parentNode.getAttribute("active");

                if (FBTest.ok(infoTipActive,
                    "There must be an infotip shown when hovering the value of the '"+propName+
                    "' property "))
                {
                    var win = infoTip.ownerDocument.defaultView;
                    var cs = win.getComputedStyle(infoTip.firstChild);

                    FBTest.compare(expectedValue, infoTip.innerHTML,
                        "The infotip must contain the same value as specified in the " +
                        "style '"+propName+"'.");
                }

                // Hover something else, so the infotip gets hidden again
                FBTest.mouseOver(infoTip.ownerDocument.body, 0, 0);

                callback();
            });

            FBTest.mouseOver(propValue, 0, 0);
        }
    }
}

function executeMatchedSelectorTest(propName, type, expectedValue, selectorIndex, callback)
{
    var panel = FBTest.selectSidePanel("computed");
    var propNames = panel.panelNode.getElementsByClassName("stylePropName");

    for (var i = 0; i < propNames.length; ++i)
    {
        if (propNames[i].textContent == propName)
        {
            var style = FW.FBL.getAncestorByClass(propNames[i], "computedStyle");
            var propAlreadyExpanded = FW.FBL.hasClass(style, "opened");
            var config = {
                tagName: "tr",
                classes: "focusRow computedStyleRow computedStyle hasSelectors opened",
                onlyMutations: !propAlreadyExpanded
            };

            FBTest.waitForDisplayedElement("computed", config, function(row)
            {
                var propValue = row.nextSibling.getElementsByClassName("stylePropValue").item(selectorIndex);

                var config = {tagName: "div", classes: infoTipTypes[type].class};
                FBTest.waitForDisplayedElement("computed", config, function (infoTip)
                {
                    var infoTipActive = infoTip.parentNode.getAttribute("active");

                    if (FBTest.ok(infoTipActive,
                        "There must be an infotip shown when hovering the value of the '"+propName+
                        "' property "))
                    {
                        var win = infoTip.ownerDocument.defaultView;
                        var cs = win.getComputedStyle(infoTip.firstChild);

                        FBTest.compare(expectedValue, infoTip.innerHTML,
                            "The infotip must contain the same value as specified in the " +
                            "style '"+propName+"'.");
                    }

                    // Hover something else, so the infotip gets hidden again
                    FBTest.mouseOver(infoTip.ownerDocument.body, 0, 0);

                    callback();
                });

                FBTest.mouseOver(propValue, 0, 0);
            });

            if (!propAlreadyExpanded)
                FBTest.click(propNames[i]);
        }
    }
}
