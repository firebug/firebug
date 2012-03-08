
function funcTest(a,b,c)
{
    console.log("Begin");

    debugger;
    func(a,b,c); //step into here

    console.log("End");
}

function func(a,b,c)
{
    //No enter here
    console.log(a,b,c);
}