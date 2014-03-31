with (FW.FBL)
{
// ********************************************************************************************* //

function runTest()
{
    var template1 = domplate(
    {
        tag:
            DIV({'class':'t1'}, "$object|getValue"),

        getValue: function(object)
        {
            return "temp1 " + object.value;
        },
    });

    var template2 = domplate(template1,
    {
        getValue: function(object)
        {
            return "temp2 " + object.value;
        },
    });

    var parentNode = document.getElementById("firebugTestElement");
    template1.tag.replace({object: {value: 'topArg'}}, parentNode);

    FBTest.compare("temp1 topArg", parentNode.textContent, "The content must match.");

    FBTest.testDone();
}

// ********************************************************************************************* //
}
