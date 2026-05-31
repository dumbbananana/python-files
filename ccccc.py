import math as m

def calcualte ():
    try:
     if operation == "+":
       print(f"{first + second}")
     elif operation == '-':
        print(f"{first - second}")
     elif operation == '*':
        print(f"{first * second}")
     elif operation == '**':
        print(f"{first ** second}")
     elif operation == '/':
        print(f"{first / second}")
     elif operation == "%":
        print(f"{first % second}")
     else:
        print(f"{operation} is not a valid operation provided\n")

    except ZeroDivisionError:
        print("cannot divide ero with zero, try again \n")



print("avilable operations \n+\n-\n*\n**\n/\n%")
print("/q to quit")
while True:
 operation = (input("enter your operation : "))
 if operation == "/q":
     break

 elif operation not in ["+", "-", "*", "**", "/", "%"]:
    print("operant not avilable \n")

 else:
     try:
      first = int(input("enter your first number : "))
      second = int(input("enter your second number : "))
     except:
      print("enter value")

     else:
         calcualte()


