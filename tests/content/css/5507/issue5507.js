function runTest()
{
    FBTest.sysout("issue5507.START");

    FBTest.openNewTab(basePath + "css/5507/issue5507.html", function(win)
    {
        FBTest.openFirebug();

        // Save the current value of the "colorDisplay" preference,
        // so we can revert it after the test is finished
        var prefOrigValue = FBTest.getPref("colorDisplay");

        var tests = [];
        tests.push(checkCSSPanel);
        tests.push(checkStyleSidePanel);
        tests.push(checkComputedSidePanel);

        FBTestFirebug.runTestSuite(tests, function()
        {
            FBTest.setPref("colorDisplay", prefOrigValue);
            FBTest.testDone("issue5507; DONE");
        });
    });
}


function checkCSSPanel(callback)
{
    var panel = FBTest.selectPanel("stylesheet");

    FBTest.selectPanelLocationByName(panel, "issue5507.html");

    var expectedValues = {
        authored: ["#f00", "green", "rgba(0, 0, 255, 1)"],
        hex: ["#FF0000", "#008000", "#0000FF"],
        rgb: ["rgb(255, 0, 0)", "rgb(0, 128, 0)", "rgb(0, 0, 255)"],
        hsl: ["hsl(0, 100%, 50%)", "hsl(120, 100%, 25%)", "hsl(240, 100%, 50%)"]
    };

    checkColorValues(panel.panelNode, expectedValues);

    callback();
}

function checkStyleSidePanel(callback)
{
    FBTest.selectPanel("html");

    FBTest.selectElementInHtmlPanel("element1", function()
    {
        var panel = FBTest.selectSidePanel("css");
        var expectedValues = {
            authored: ["rgba(0, 0, 255, 1)", "green", "#f00"],
            hex: ["#0000FF", "#008000", "#FF0000"],
            rgb: ["rgb(0, 0, 255)", "rgb(0, 128, 0)", "rgb(255, 0, 0)"],
            hsl: ["hsl(240, 100%, 50%)", "hsl(120, 100%, 25%)", "hsl(0, 100%, 50%)"]
        };

        checkColorValues(panel.panelNode, expectedValues);

        callback();
    });
}

function checkComputedSidePanel(callback)
{
    FBTest.selectPanel("html");

    FBTest.selectElementInHtmlPanel("element1", function()
    {
        var panel = FBTest.selectSidePanel("computed");
        var stylePropNames = panel.panelNode.getElementsByClassName("stylePropName");

        var expectedValues = {
            authored: ["rgba(0,\u200B 0,\u200B 255,\u200B 1)", "green", "#f00"],
            hex: ["#0000FF", "#008000", "#FF0000"],
            rgb: ["rgb(0,\u200B 0,\u200B 255)", "rgb(0,\u200B 128,\u200B 0)",
                "rgb(255,\u200B 0,\u200B 0)"],
            hsl: ["hsl(240,\u200B 100%,\u200B 50%)", "hsl(120,\u200B 100%,\u200B 25%)",
                "hsl(0,\u200B 100%,\u200B 50%)"]
        };

        for (var prefValue in expectedValues)
        {
            FBTest.setPref("colorDisplay", prefValue);

            var colorPropIndex = 0;
            while (stylePropNames[colorPropIndex].textContent !== "color")
                colorPropIndex++;

            var computedStyle = FW.FBL.getAncestorByClass(stylePropNames[colorPropIndex],
                "computedStyle");
            var matchedSelectors = computedStyle.nextSibling;
            var values = matchedSelectors.getElementsByClassName("stylePropValue");

            for (var i = 0; i < values.length; i++)
            {
                FBTest.compare(expectedValues[prefValue][i], values[i].textContent,
                    "The color value must be '" + expectedValues[prefValue][i] + "'");
            }
        }

        callback();
    });
}

// ********************************************************************************************* //

function checkColorValues(panelNode, expectedValues)
{
    for (var prefValue in expectedValues)
    {
        FBTest.setPref("colorDisplay", prefValue);

        var values = panelNode.getElementsByClassName("cssPropValue");

        var expectedValueIndex = 0;
        for (var i = 0; i < values.length; i++)
        {
            var prop = FW.FBL.getAncestorByClass(values[i], "cssProp");
            var propName = prop.getElementsByClassName("cssPropName")[0];

            if (propName.textContent === "color")
            {
                FBTest.compare(expectedValues[prefValue][expectedValueIndex],
                    values[i].textContent,
                    "The color value must be '" +
                    expectedValues[prefValue][expectedValueIndex] + "'");
                expectedValueIndex++;
            }
        }
    }
}
