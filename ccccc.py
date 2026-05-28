studgpa= input("whose gpa you want to add : ")
ask= input("addgpa: ")





dictionary = {
        studgpa: {
            "gpa": ask
        }
        ,
        studgpa: {
            "gpa": ask
        }
    }

whose = input("whose gpa you want")

print("errpr finding data")

try:
    print(dictionary[whose]["gpa"])
except:
    print("cannot find data")
