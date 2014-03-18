function runTest()
{
    FBTest.setFirebugBarHeight(450);

    FBTest.openNewTab(basePath + "css/4683/issue4683.html", function(win)
    {
        FBTest.openFirebug(function()
        {
            var panel = FBTest.selectPanel("stylesheet");

            FBTest.selectPanelLocationByName(panel, "issue4683.html");

            var tests = [];
            tests.push(verdanaHover);
            tests.push(comicSansMSHover);

            FBTest.runTestSuite(tests, function()
            {
                FBTest.testDone();
            });
        });
    });
}

function verdanaHover(callback)
{
    executeTest("#fontFamilyTest1", "Verdana", callback);
}

function comicSansMSHover(callback)
{
    executeTest("#fontFamilyTest2", "Courier New", callback);
}

//************************************************************************************************

function executeTest(elementID, expected, callback)
{
    FBTest.searchInCssPanel(elementID, function(node)
    {
        FBTest.sysout("issue4683; selection: ", node);

        var rule = FW.FBL.getAncestorByClass(node, "cssRule");
        var propValue = rule.querySelector(".cssPropValue");
        var config = {tagName: "div", classes: "infoTipFontFamilySample"};

        FBTest.mouseOver(propValue);

        FBTest.waitForDisplayedElement("stylesheet", config, function (infoTip)
        {
            var divsUsingFont = 0;
            var divsContainingText = 0;
            var sampleText = FW.FBL.$STR("css.fontFamilyPreview");
            var win = infoTip.ownerDocument.defaultView;
            var divs = infoTip.getElementsByTagName("div");

            for (var i=0; i<divs.length; i++)
            {
                var computedStyle = window.getComputedStyle(divs[i], null);
                if (computedStyle.getPropertyValue("font-family") == expected)
                    divsUsingFont++;
                if (divs[i].textContent == sampleText)
                    divsContainingText++;
            }

            FBTest.compare(divs.length, divsUsingFont, "All divs inside the tooltip must use the '"+expected+"' font");
            FBTest.compare(divs.length, divsContainingText, "All divs inside the '"+expected+"' tooltip must contain the text '"+sampleText+"'");

            callback();
        });
    });
}