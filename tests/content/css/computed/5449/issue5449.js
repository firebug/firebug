const infoTipTypes = {
    "color": {class: "infoTipColorBox", prop: "backgroundColor"},
    "gradient": {class: "infoTipColorBox", prop: "backgroundImage"},
    "image": {class: "infoTipImageBox", prop: "backgroundImage"},
    "fontFamily": {class: "infoTipFontFamilyBox", prop: "fontFamily"}
}

function runTest()
{
    FBTest.sysout("issue5449.START");

    FBTest.openNewTab(basePath + "css/computed/5449/issue5449.html", function(win)
    {
        FBTest.openFirebug();
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
                FBTest.testDone("issue5449; DONE");
            });
        });
    });
}

function fontFamily(callback)
{
    executeTest("font-family", 0, 0, "fontFamily", /Arial/, callback);
}

function color(callback)
{
    executeTest("background-color", 0, 0, "color", /rgb\(140,\s*140,\s*255\)/, callback);
}

function gradient(callback)
{
    executeTest("background-image", 1, 25, "gradient",
        /-moz-linear-gradient\(135deg,\s*rgb\(120,\s*140,\s*255\),\s*rgb\(180,\s*200,\s*255\)/,
        callback);
}

function image(callback)
{
    executeTest("background-image", 0, 0, "image",
        new RegExp(basePath+"css\/computed\/5449\/firebug.png"), callback);
}

//************************************************************************************************

function executeTest(propName, offsetX, offsetY, type, expectedValue, callback)
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
    
            FBTest.mouseOver(propValue, offsetX, offsetY);
        }
    }
}