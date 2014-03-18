function runTest()
{
    FBTest.setFirebugBarHeight(450);

    FBTest.openNewTab(basePath + "css/4411/issue4411.html", function(win)
    {
        FBTest.openFirebug(function()
        {
            var panel = FBTest.selectPanel("stylesheet");

            FBTest.selectPanelLocationByName(panel, "issue4411.html");

            var tests = [];
            tests.push(hexValue);
            tests.push(namedColor);
            tests.push(rgb);
            tests.push(rgba);
            tests.push(hsl);
            tests.push(hsla);

            FBTest.runTestSuite(tests, function()
            {
                FBTest.testDone();
            });
        });
    });
}

function hexValue(callback)
{
    executeTest("#hex", "rgb(140, 255, 140)", callback);
}

function namedColor(callback)
{
    executeTest("#name", "lightgreen", callback);
}

function rgb(callback)
{
    executeTest("#rgb", "rgb(140, 255, 140)", callback);
}

function rgba(callback)
{
    executeTest("#rgba", "rgba(140, 255, 140, 0.5)", callback);
}

function hsl(callback)
{
    executeTest("#hsl", "rgb(137, 255, 137)", callback);
}

function hsla(callback)
{
    executeTest("#hsla", "rgba(137, 255, 137, 0.5)", callback);
}

//************************************************************************************************

function executeTest(elementID, expectedValue, callback)
{
    var node = FBTest.getStyleRulesBySelector(elementID)[0];

    // Need to scroll the panel a bit, so that the background prop is visible (issue 4727)
    var panel = FW.FBL.getAncestorByClass(node, "panelNode");
    panel.scrollTop += 20;

    var rule = FW.FBL.getAncestorByClass(node, "cssRule");
    var propValue = rule.getElementsByClassName("cssPropValue").item(0);
    var propName = rule.getElementsByClassName("cssPropName").item(0);

    var config = {tagName: "div", classes: "infoTipColorBox"};
    FBTest.waitForDisplayedElement("stylesheet", config, function (infoTip)
    {
        var infoTipActive = infoTip.parentNode.getAttribute("active");

        if (FBTest.ok(infoTipActive,
            "There must be a color infotip shown hovering the value of the 'color' property " +
            "of '" + elementID + "'."))
        {
            FBTest.compare(expectedValue, infoTip.firstChild.style.backgroundColor,
                "The infotip must contain the same color as specified in the " +
                "rule '" + elementID + "'.");
        }

        // Hide the info tip by moving mouse over the CSS prop name,
        // otherwise it could block the mouse-move over the next CSS value.
        // (fixex failure on Mac).
        FBTest.mouseOver(propName);

        callback();
    });

    FBTest.mouseOver(propValue);
}