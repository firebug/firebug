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

    var tasks = new FBTest.TaskList();
    tasks.push(verifyResult, true, ["a"]);
    tasks.push(verifyResult, true, document.getElementsByClassName("test"));
    tasks.push(verifyResult, true, document.querySelectorAll("div"));
    tasks.push(verifyResult, true, document.body.classList);
    tasks.push(verifyResult, true, new jQuery());
    tasks.push(verifyResult, false, "a");
    tasks.push(verifyResult, false, 1);
    tasks.push(verifyResult, false, null);
    tasks.push(verifyResult, false, undefined);
    tasks.push(verifyResult, false, NaN);
    tasks.push(verifyResult, false, Infinity);
    tasks.push(verifyResult, false, -Infinity);
    tasks.push(verifyResult, false, new object("Peter"));
    tasks.push(verifyResult, false, {hello: "Hello Firebug user!"});

    tasks.run(FBTest.testDone, 0);
}

function verifyResult(callback, expected, variable)
{
    var result = FW.FBL.isArrayLike(variable);
    FBTest.compare(expected, result,
        "Variable must" + (expected ? "" : " not") + " be an array-like object");

    callback();
}