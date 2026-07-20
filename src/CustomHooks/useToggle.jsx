import {useState} from 'react'


const useToggle = (initialValue) => {
  const [isToggled, setValue] = useState(initialValue)
  const toggle = () => setValue(prev => !prev)

  return [isToggled, toggle]
}


export default useToggle
