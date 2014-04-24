function runTest()
{
    FBTest.openNewTab(basePath + "html/style/4470/issue4470.html", (win) =>
    {
        // Open Firebug
        FBTest.openFirebug(() =>
        {
            // Switch to html panel
            FBTest.selectPanel("html");

            var tests = [];
            tests.push(testCaseOne);
            tests.push(testCaseTwo);
            FBTest.runTestSuite(tests, FBTest.testDone);
        });
    });
}

function testCaseOne(callback)
{
    executeGradientTest("element1", /linear-gradient\(-45deg,\s*#788cff,\s*#b4c8ff\)/, callback); 
}

function testCaseTwo(callback)
{
    executeGradientTest("element2", /radial-gradient\(circle,\s*#b4ffc8,\s*#78ff8c\)/, callback); 
}

function executeGradientTest(element, gradian, callback) 
{
    // Inspect #element1
    FBTest.selectElementInHtmlPanel(element, () =>
    {
        // Select Style side panel
        var panelNode = FBTest.selectPanel("css").panelNode;

        // Get background-image property of #element1
        FBTest.getCSSProp("#" + element, "background-image", (prop) =>
        {
            var value = prop.getElementsByClassName("cssPropValue")[0];

            var config = {
                tagName: "div",
                classes: "infoTipColorBox"
            };

            FBTest.waitForDisplayedElement("css", config, function (infoTip)
            {
                FBTest.compare(gradian, infoTip.innerHTML,
                    "The infotip must contain the same value as specified in the " +
                    "style 'background-image'.");

                // Hover somthing else
                FBTest.mouseOver(panelNode, 0, 0);
                
                callback();
            });

            FBTest.mouseOver(value);
        });
    });
}
