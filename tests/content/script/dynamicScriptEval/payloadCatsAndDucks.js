function prod(animal)
{
    animal.say();
};

var duck = function()
{
    this.say = function()
    {
        console.log('quack\n');
    };
};

var cat = function()
{
    this.say = function()
    {
        console.log('meow!!\n');
    };
};
