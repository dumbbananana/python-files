bankid = 123123
cash = 10000

def function():
    while True:
     lunl = input("load , unload :")
     if lunl == "unload":
        howmuch = int(input("amount : "))
        if howmuch <= cash :
            print("transaction successfull , remaining balance is ", cash - howmuch, "Rs")
        elif howmuch > cash :
            print("insufficient amount")
        else :
            print("error")
            
     if lunl == "load":
        howmuch2 = int(input("amount : "))
        print("transaction successfull , remaining balance is ", cash + howmuch2, "Rs")
     else:
         break
        
        
        
       


print("bank access")
while True :
 idask = int(input("enter your bank id : "))
 if idask == bankid :
    function ()
 elif idask == False:
  pass
   
