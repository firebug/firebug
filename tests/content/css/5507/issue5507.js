function runTest()
{
    FBTest.openNewTab(basePath + "css/5507/issue5507.html", function(win)
    {
        FBTest.openFirebug(function()
        {
            // Save the current value of the "colorDisplay" and "expandShorthandProps" preferences,
            // so we can revert it after the test is finished
            var colorDisplayOrigValue = FBTest.getPref("colorDisplay");
            var expandShorthandPropsOrigValue = FBTest.getPref("expandShorthandProps");

            var tests = [];
            tests.push(checkCSSPanel);
            tests.push(checkStyleSidePanel);
            tests.push(checkComputedSidePanel);

            FBTestFirebug.runTestSuite(tests, function()
            {
                FBTest.setPref("colorDisplay", colorDisplayOrigValue);
                FBTest.setPref("expandShorthandProps", expandShorthandPropsOrigValue);
                FBTest.testDone();
            });
        });
    });
}


function checkCSSPanel(callback)
{
    FBTest.progress("Check CSS panel display");

    var panel = FBTest.selectPanel("stylesheet");

    FBTest.selectPanelLocationByName(panel, "issue5507.html");

    FBTest.progress("Check with shorthand props collapsed");
    FBTest.setPref("expandShorthandProps", false);

    var expectedValues = {
        authored: ["linear-gradient(135deg, rgb(180, 200, 255), #788cff) repeat scroll 0 0 " +
            "blue", "#f00", "green", "rgba(0, 0, 255, 1)"],
        hex: ["linear-gradient(135deg, #B4C8FF, #788CFF) repeat scroll 0 0 #0000FF",
            "#FF0000", "#008000", "#0000FF"],
        rgb: ["linear-gradient(135deg, rgb(180, 200, 255), rgb(120, 140, 255)) repeat scroll 0 " +
            "0 rgb(0, 0, 255)", "rgb(255, 0, 0)", "rgb(0, 128, 0)", "rgb(0, 0, 255)"],
        hsl: ["linear-gradient(135deg, hsl(224, 100%, 85%), hsl(231, 100%, 74%)) repeat scroll " +
            "0 0 hsl(240, 100%, 50%)", "hsl(0, 100%, 50%)", "hsl(120, 100%, 25%)",
            "hsl(240, 100%, 50%)"]
    };

    checkColorValues(panel.panelNode, ["color", "background"], expectedValues);

    FBTest.progress("Check with shorthand props expanded");
    FBTest.setPref("expandShorthandProps", true);

    var expectedValues = {
        authored: ["linear-gradient(135deg, rgb(180, 200, 255), #788cff)"],
        hex: ["linear-gradient(135deg, #B4C8FF, #788CFF)"],
        rgb: ["linear-gradient(135deg, rgb(180, 200, 255), rgb(120, 140, 255))"],
        hsl: ["linear-gradient(135deg, hsl(224, 100%, 85%), hsl(231, 100%, 74%))"]
    };

    checkColorValues(panel.panelNode, ["background-image"], expectedValues);

    callback();
}

function checkStyleSidePanel(callback)
{
    FBTest.progress("Check Style side panel display");

    FBTest.selectPanel("html");

    FBTest.progress("Check with shorthand props collapsed");
    FBTest.setPref("expandShorthandProps", false);

    FBTest.selectElementInHtmlPanel("element1", function()
    {
        var panel = FBTest.selectSidePanel("css");
        var expectedValues = {
            authored: ["rgba(0, 0, 255, 1)", "green", "linear-gradient(135deg, " +
                "rgb(180, 200, 255), #788cff) repeat scroll 0 0 blue", "#f00"],
            hex: ["#0000FF", "#008000", "linear-gradient(135deg, #B4C8FF, #788CFF) repeat " +
                "scroll 0 0 #0000FF", "#FF0000"],
            rgb: ["rgb(0, 0, 255)", "rgb(0, 128, 0)", "linear-gradient(135deg, " +
                "rgb(180, 200, 255), rgb(120, 140, 255)) repeat scroll 0 0 rgb(0, 0, 255)",
                "rgb(255, 0, 0)"],
            hsl: ["hsl(240, 100%, 50%)", "hsl(120, 100%, 25%)", "linear-gradient(135deg, " +
                "hsl(224, 100%, 85%), hsl(231, 100%, 74%)) repeat scroll 0 0 hsl(240, 100%, 50%)",
                "hsl(0, 100%, 50%)"]
        };

        checkColorValues(panel.panelNode, ["color", "background"], expectedValues);

        callback();
    });
}

function checkComputedSidePanel(callback)
{
    FBTest.progress("Check Computed side panel display");

    FBTest.selectPanel("html");

    FBTest.selectElementInHtmlPanel("element1", function()
    {
        var panel = FBTest.selectSidePanel("computed");
        var stylePropNames = panel.panelNode.getElementsByClassName("stylePropName");

        var expectedValues = {
            color:
            {
                authored: ["rgba(0,\u200B 0,\u200B 255,\u200B 1)", "green", "#f00"],
                hex: ["#0000FF", "#008000", "#FF0000"],
                rgb: ["rgb(0,\u200B 0,\u200B 255)", "rgb(0,\u200B 128,\u200B 0)",
                    "rgb(255,\u200B 0,\u200B 0)"],
                hsl: ["hsl(240,\u200B 100%,\u200B 50%)", "hsl(120,\u200B 100%,\u200B 25%)",
                    "hsl(0,\u200B 100%,\u200B 50%)"]
            },
            "background-color":
            {
                authored: ["blue"],
                hex: ["#0000FF"],
                rgb: ["rgb(0,\u200B 0,\u200B 255)"],
                hsl: ["hsl(240,\u200B 100%,\u200B 50%)"]
            }
        };

        for (var propName in expectedValues)
        {
            for (var propValue in expectedValues[propName])
            {
                FBTest.progress("Check with 'colorDisplay' set to '" + propValue + "'");
                FBTest.setPref("colorDisplay", propValue);

                var computedStyle = FBTest.getComputedProperty(propName);
                var matchedSelectors = computedStyle.nextSibling;
                var values = matchedSelectors.getElementsByClassName("stylePropValue");

                for (var i = 0; i < values.length; i++)
                {
                    FBTest.compare(expectedValues[propName][propValue][i], values[i].textContent,
                        "The '" + propName + "' value must be '" + expectedValues[propName][propValue][i] + "'");
                }
            }
        }

        callback();
    });
}

// ********************************************************************************************* //

function checkColorValues(panelNode, checkedProps, expectedValues)
{
    for (var propValue in expectedValues)
    {
        FBTest.progress("Check with 'colorDisplay' set to '" + propValue + "'");
        FBTest.setPref("colorDisplay", propValue);

        var values = panelNode.getElementsByClassName("cssPropValue");

        var expectedValueIndex = 0;
        for (var i = 0; i < values.length; i++)
        {
            var prop = FW.FBL.getAncestorByClass(values[i], "cssProp");
            var propName = prop.getElementsByClassName("cssPropName")[0];

            if (checkedProps.indexOf(propName.textContent) !== -1)
            {
                FBTest.compare(expectedValues[propValue][expectedValueIndex],
                    values[i].textContent,
                    "The property value must be '" +
                    expectedValues[propValue][expectedValueIndex] + "'");
                expectedValueIndex++;
            }
        }
    }
}
