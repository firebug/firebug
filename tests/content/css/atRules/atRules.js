function runTest()
{
    FBTest.openNewTab(basePath + "css/atRules/atRules.html", function(win)
    {
        FBTest.openFirebug(function () {
            FBTest.selectPanel("stylesheet");

            var tests = [];
            tests.push(testAtCharsetRule);
            tests.push(testAtDocumentRule);
            tests.push(testAtKeyframesRule);
            tests.push(testAtPageRule);
            tests.push(testAtSupportsRule);

            FBTest.runTestSuite(tests, function()
            {
                FBTest.testDone();
            });
        });
    });
}

function testAtCharsetRule(callback)
{
    var panel = FBTest.getSelectedPanel();
    FBTest.selectPanelLocationByName(panel, "atCharset.css");
    var rule = panel.panelNode.getElementsByClassName("cssRule")[0];

    var ruleName = rule.getElementsByClassName("cssRuleName")[0];
    FBTest.compare("@charset", ruleName.textContent, "Rule name must be '@charset'");

    var ruleValue = rule.getElementsByClassName("cssRuleValue")[0];
    var expectedValue = "UTF-8";
    FBTest.compare(expectedValue, ruleValue.textContent, "Rule value must be '" + expectedValue +
        "'");

    // Click the rule value to open the inline editor
    FBTest.synthesizeMouse(ruleValue);
    var editor = panel.panelNode.getElementsByClassName("textEditorInner")[0];

    if (FBTest.ok(editor, "Inline editor must be available"))
    {
        FBTest.sendShortcut("VK_DOWN");
        FBTest.compare("US-ASCII", editor.value, "Value must now be 'US-ASCII'");
        FBTest.sendShortcut("VK_UP");
        FBTest.compare("UTF-8", editor.value, "Value must now be 'UTF-8'");
    }

    callback();
}

function testAtDocumentRule(callback)
{
    var panel = FBTest.getSelectedPanel();
    FBTest.selectPanelLocationByName(panel, "atDocument.css");
    var rule = panel.panelNode.getElementsByClassName("cssRule")[0];

    var ruleName = rule.getElementsByClassName("cssRuleName")[0];
    FBTest.compare("@-moz-document", ruleName.textContent, "Rule name must be '@-moz-document'");

    var ruleValue = rule.getElementsByClassName("cssDocumentRuleCondition")[0];
    var expectedValue = "url(\"https://getfirebug.com/\"), " +
        "url-prefix(\"https://getfirebug.com/tests/\"), " +
        "domain(\"getfirebug.com\"), " +
        "regexp(\"https:.*\")";
    FBTest.compare(expectedValue, ruleValue.textContent, "Rule value must be '" + expectedValue +
        "'");

    // Click the rule value to open the inline editor
    FBTest.synthesizeMouse(ruleValue);
    var editor = panel.panelNode.getElementsByClassName("textEditorInner")[0];

    if (FBTest.ok(editor, "Inline editor must be available"))
    {
        var newValue = "url(https://mozilla.org)";
        FBTest.sendString(newValue, editor);

        // Stop inline editing
        FBTest.synthesizeMouse(panel.panelNode, 0, 0);
        FBTest.compare(newValue, ruleValue.textContent, "Rule value must be '" + newValue + "'");
    }

    callback();
}

function testAtKeyframesRule(callback)
{
    var panel = FBTest.getSelectedPanel();
    FBTest.selectPanelLocationByName(panel, "atKeyframes.css");
    var rule = panel.panelNode.getElementsByClassName("cssRule")[0];

    var ruleName = rule.getElementsByClassName("cssRuleName")[0];
    FBTest.compare("@keyframes", ruleName.textContent, "Rule name must be '@keyframes'");

    var ruleValue = rule.getElementsByClassName("cssKeyframesRuleName")[0];
    var expectedValue = "identifier";
    FBTest.compare(expectedValue, ruleValue.textContent, "Rule value must be '" + expectedValue +
        "'");

    // Click the rule value to open the inline editor
    FBTest.synthesizeMouse(ruleValue);
    var editor = panel.panelNode.getElementsByClassName("textEditorInner")[0];

    if (FBTest.ok(editor, "Inline editor must be available"))
    {
        var newValue = "newIdentifier";
        FBTest.sendString(newValue, editor);

        // Stop inline editing
        FBTest.synthesizeMouse(panel.panelNode, 0, 0);
        FBTest.compare(newValue, ruleValue.textContent, "Rule value must be '" + newValue + "'");
    }

    var keyframeRules = panel.panelNode.getElementsByClassName("cssKeyText");

    if (FBTest.compare(4, keyframeRules.length, "There must be 4 keyframe rules"))
    {
        // Click the rule value to open the inline editor
        FBTest.synthesizeMouse(keyframeRules[0]);
        var editor = panel.panelNode.getElementsByClassName("textEditorInner")[0];

        var newValue = "10%";
        FBTest.sendString(newValue, editor);

        // Stop inline editing
        FBTest.synthesizeMouse(panel.panelNode, 0, 0);
        FBTest.compare(newValue, keyframeRules[0].textContent, "Rule value must be '" + newValue +
            "'");
    }

    callback();
}

function testAtPageRule(callback)
{
    var panel = FBTest.getSelectedPanel();
    FBTest.selectPanelLocationByName(panel, "atPage.css");
    var rule = panel.panelNode.getElementsByClassName("cssRule")[0];

    var ruleName = rule.getElementsByClassName("cssRuleName")[0];
    FBTest.compare("@page", ruleName.textContent, "Rule name must be '@page'");

    var propNames = rule.getElementsByClassName("cssPropName");

    if (FBTest.compare(1, propNames.length, "There must be one property inside the @page rule"))
    {
        FBTest.compare("margin", propNames[0].textContent, "The property name must be 'margin'");

        var prop = FW.FBL.getAncestorByClass(propNames[0], "cssProp");
        var propValue = prop.getElementsByClassName("cssPropValue")[0];
        FBTest.compare("2cm 3cm", propValue.textContent, "The property value must be '2cm 3cm'");
    }

    callback();
}

function testAtSupportsRule(callback)
{
    var panel = FBTest.getSelectedPanel();
    FBTest.selectPanelLocationByName(panel, "atSupports.css");
    var rule = panel.panelNode.getElementsByClassName("cssRule")[0];

    var ruleName = rule.getElementsByClassName("cssRuleName")[0];
    FBTest.compare("@supports", ruleName.textContent, "Rule name must be '@supports'");

    var ruleValue = rule.getElementsByClassName("cssSupportsRuleCondition")[0];
    var expectedValue = "(animation-name: test)";
    FBTest.compare(expectedValue, ruleValue.textContent, "Rule value must be '" + expectedValue +
        "'");

    callback();
}
