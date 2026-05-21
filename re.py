a = 0
b=0
arr = []
total = 0
num = int(input("how many subjects you took ? : "))
if 10>= num > 0:



 while b < num:
    give = int(input())
    arr.append(give)
    b += 1
#
 def func():
    
    print("total is ", total)
#
 def avg():
    average = total / len(arr)
    print("the average is ", average)
#
 def grade():
    if total == num*100:
        grade = "S"
    elif num*100>total>num*95 :
        grade = "A"
    elif num*95>=total>num*85:
        grade = "B"
    elif num*85>=total>num*80 :
        grade = "C"
    elif num*80>=total>num*65:
        grade = "B"
    else:
        grade = "pass"
    print("your grade is ",grade )
#
 while a  < len(arr):
    total +=  arr[a]
    if arr[a] > num*100:
        print(arr[a],"has wrong grades")
    a += 1  
 func()
 avg()
 grade() 
    
else:
     print("enter correct subject amt")
#   
