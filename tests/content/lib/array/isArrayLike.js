function runTest()
{
    function object(name)
    {
        this.name = name;
    }

    object.prototype.toString = function()
    {
        return this.name;
    }

    // Simulates a jQuery object
    function jQuery()
    {
        this.splice = function()
        {
            console.log("splice me!");
        }

        this.length = 0;
    }

    verifyResult(true, ["a"]);
    verifyResult(true, document.getElementsByClassName("test"));
    verifyResult(true, document.querySelectorAll("div"));
    verifyResult(true, document.body.classList);
    verifyResult(true, new jQuery());
    verifyResult(false, "a");
    verifyResult(false, 1);
    verifyResult(false, null);
    verifyResult(false, undefined);
    verifyResult(false, NaN);
    verifyResult(false, Infinity);
    verifyResult(false, -Infinity);
    verifyResult(false, new object("Peter"));
    verifyResult(false, {hello: "Hello Firebug user!"});
    verifyResult(false, {0: "Hi", length: 1});

    FBTest.testDone();
}

function verifyResult(expected, variable)
{
    var result = FW.FBL.isArrayLike(variable);
    FBTest.compare(expected, result,
        "Variable must" + (expected ? "" : " not") + " be an array-like object");
}